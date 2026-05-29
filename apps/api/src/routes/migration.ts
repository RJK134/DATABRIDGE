/**
 * Migration routes (Phase J).
 *
 *   POST /migration/policy/parse            (J2)
 *   POST /migration/policy/parse-partial    (J2)
 *   POST /migration/run                     (J3 — dry-run by default)
 *   POST /migration/verify                  (J4 — diff two canonical projections)
 *   POST /migration/pre-flight              (J5 — gating schema checks)
 *   GET  /migration/queue                   (J6 — operational-input queue snapshot)
 *   POST /migration/queue/resolve           (J6 — resolve an open queue item)
 *   POST /migration/queue/skip              (J6 — skip an open queue item)
 *
 * All endpoints are stateless except the queue, which uses a single
 * process-local OperationalInputQueue instance.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  parseMigrationPolicy,
  parsePartialPolicy,
  type MigrationPolicy,
} from "@databridge/migration-policy";
import { MigrationRunner, type SourceRow } from "@databridge/migration-runner";
import {
  InMemoryTransport,
  SitsTargetAdapter,
  BannerTargetAdapter,
  type TargetTransport,
} from "@databridge/target-adapters";
import {
  verifyCanonical,
  diffsToCsv,
  summariseDhp,
  type CanonicalRecord,
} from "@databridge/parallel-run-verifier";
import {
  runPreFlightCheck,
  BUNDLED_REQUIREMENTS,
  summarisePreFlight,
} from "@databridge/pre-flight-check";
import { OperationalInputQueue } from "@databridge/operational-input-queue";
import { createDefaultRegistry } from "@databridge/codeset-mapper";
import type { AdapterContext } from "@databridge/adapter-spec";
import type { SecretAccessor } from "@databridge/platform";

/** A shared queue instance across handlers within one server process. */
const queue = new OperationalInputQueue();

// =====================================================================
// Schemas
// =====================================================================
const ParseBodyZ = z.object({ bundle: z.unknown() });

const RunBodyZ = z.object({
  policy: z.unknown(),
  rows: z.array(
    z.object({
      entity: z.string().min(1),
      data: z.record(z.unknown()),
      sourceId: z.string().optional(),
    })
  ),
  dryRun: z.boolean().default(true),
  migrationRunId: z.string().min(1).default("run-adhoc"),
  /** Pick the target adapter. */
  targetSystem: z.enum(["sits", "banner"]).optional(),
  /** Optional STVTERM lookup table for the term-to-ayr stvterm-driven strategy. */
  stvtermAyr: z.record(z.string()).optional(),
});

const VerifyBodyZ = z.object({
  a: z.array(
    z.object({
      entity: z.string(),
      id: z.string(),
      fields: z.record(z.unknown()),
    })
  ),
  b: z.array(
    z.object({
      entity: z.string(),
      id: z.string(),
      fields: z.record(z.unknown()),
    })
  ),
  treatBlanksAsEqual: z.boolean().default(false),
  fieldsByEntity: z.record(z.array(z.string())).optional(),
  /** When true response includes a CSV body field; default false. */
  emitCsv: z.boolean().default(false),
});

const PreFlightBodyZ = z.object({
  requirements: z.union([
    z.string().min(1),
    z.array(
      z.object({
        table: z.string(),
        field: z.string(),
        gates: z.string(),
      })
    ),
  ]),
  /** Pre-declared (table, field) pairs to seed the InMemoryTransport. */
  declared: z.array(z.object({ table: z.string(), field: z.string() })).default([]),
});

const QueueResolveBodyZ = z.object({
  id: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  resolvedBy: z.string(),
});

const QueueSkipBodyZ = z.object({
  id: z.string(),
  resolvedBy: z.string(),
  note: z.string().optional(),
});

const QueueEnqueueBodyZ = z.object({
  entity: z.string(),
  field: z.string(),
  reason: z.string(),
  sourceId: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

// =====================================================================
// Helpers
// =====================================================================
function makeStubContext(): AdapterContext {
  const secrets: SecretAccessor = {
    async get(_k: string) {
      return "";
    },
  };
  return {
    tenantId: "api",
    connectionId: "stateless",
    secrets,
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    signal: new AbortController().signal,
  };
}

// =====================================================================
// Routes
// =====================================================================
export async function migrationRoutes(app: FastifyInstance): Promise<void> {
  // J2 ---------------------------------------------------------------
  app.post("/migration/policy/parse", async (req, reply) => {
    const parsed = ParseBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    try {
      const policy: MigrationPolicy = parseMigrationPolicy(parsed.data.bundle);
      return { policy };
    } catch (err) {
      return reply.code(400).send({
        error: "invalid_policy",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/migration/policy/parse-partial", async (req, reply) => {
    const parsed = ParseBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    try {
      const policy: MigrationPolicy = parsePartialPolicy(parsed.data.bundle);
      return { policy };
    } catch (err) {
      return reply.code(400).send({
        error: "invalid_policy",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // J3 ---------------------------------------------------------------
  app.post("/migration/run", async (req, reply) => {
    const parsed = RunBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    let policy: MigrationPolicy;
    try {
      policy = parseMigrationPolicy(parsed.data.policy);
    } catch (err) {
      return reply.code(400).send({
        error: "invalid_policy",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    const transport = new InMemoryTransport();
    // Seed declared fields needed by pre-flight bundles to keep the
    // dry-run end-to-end happy when those checks fire elsewhere.
    transport.declareField("SHRDGMR", "INST_HONOR");
    transport.declareField("SGBSTDN", "RESD_CODE");

    const targetSystem = parsed.data.targetSystem ?? policy.targetSystem;
    const adapter =
      targetSystem === "banner"
        ? new BannerTargetAdapter(transport)
        : new SitsTargetAdapter(transport);

    const runnerOpts: ConstructorParameters<typeof MigrationRunner>[0] = {
      policy,
      targetAdapter: adapter,
      codesetRegistry: createDefaultRegistry(),
      migrationRunId: parsed.data.migrationRunId,
    };
    if (parsed.data.stvtermAyr !== undefined) runnerOpts.stvtermAyr = parsed.data.stvtermAyr;

    const runner = new MigrationRunner(runnerOpts);
    const rows: SourceRow[] = parsed.data.rows.map((r) => {
      const sr: SourceRow = {
        entity: r.entity,
        data: r.data as SourceRow["data"],
      };
      if (r.sourceId !== undefined) sr.sourceId = r.sourceId;
      return sr;
    });
    const report = await runner.run({
      ctx: makeStubContext(),
      rows,
      dryRun: parsed.data.dryRun,
    });
    // Push the operational-queue entries into the shared queue
    for (const op of report.operationalQueue) {
      const item: Parameters<typeof queue.enqueue>[0] = {
        entity: op.entity,
        field: op.field,
        reason: op.reason,
      };
      if (op.sourceId !== undefined) item.sourceId = op.sourceId;
      queue.enqueue(item);
    }
    return { report };
  });

  // J4 ---------------------------------------------------------------
  app.post("/migration/verify", async (req, reply) => {
    const parsed = VerifyBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    const opts: Parameters<typeof verifyCanonical>[2] = {
      treatBlanksAsEqual: parsed.data.treatBlanksAsEqual,
    };
    if (parsed.data.fieldsByEntity !== undefined) opts.fieldsByEntity = parsed.data.fieldsByEntity;
    const report = verifyCanonical(
      parsed.data.a as CanonicalRecord[],
      parsed.data.b as CanonicalRecord[],
      opts
    );
    const result: {
      report: typeof report;
      summary: string;
      csv?: string;
    } = { report, summary: summariseDhp(report) };
    if (parsed.data.emitCsv) result.csv = diffsToCsv(report.diffs);
    return result;
  });

  // J5 ---------------------------------------------------------------
  app.post("/migration/pre-flight", async (req, reply) => {
    const parsed = PreFlightBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    const transport = new InMemoryTransport();
    for (const d of parsed.data.declared) transport.declareField(d.table, d.field);
    try {
      const report = await runPreFlightCheck({
        transport: transport as TargetTransport,
        requirements: parsed.data.requirements,
      });
      return { report, summary: summarisePreFlight(report) };
    } catch (err) {
      return reply.code(400).send({
        error: "invalid_requirements",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/migration/pre-flight/bundles", async () => {
    return { bundles: BUNDLED_REQUIREMENTS };
  });

  // J6 ---------------------------------------------------------------
  app.get("/migration/queue", async (req) => {
    const query = req.query as Record<string, unknown>;
    const status = typeof query["status"] === "string" ? query["status"] : undefined;
    const entity = typeof query["entity"] === "string" ? query["entity"] : undefined;
    const filter: Parameters<typeof queue.list>[0] = {};
    if (status === "open" || status === "resolved" || status === "skipped") {
      filter.status = status;
    }
    if (entity !== undefined) filter.entity = entity;
    return { items: queue.list(filter), stats: queue.stats() };
  });

  app.post("/migration/queue/enqueue", async (req, reply) => {
    const parsed = QueueEnqueueBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    const args: Parameters<typeof queue.enqueue>[0] = {
      entity: parsed.data.entity,
      field: parsed.data.field,
      reason: parsed.data.reason,
    };
    if (parsed.data.sourceId !== undefined) args.sourceId = parsed.data.sourceId;
    if (parsed.data.context !== undefined) args.context = parsed.data.context;
    return { item: queue.enqueue(args) };
  });

  app.post("/migration/queue/resolve", async (req, reply) => {
    const parsed = QueueResolveBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    try {
      const item = queue.resolve(parsed.data);
      return { item };
    } catch (err) {
      return reply.code(409).send({
        error: "queue_resolve_failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/migration/queue/skip", async (req, reply) => {
    const parsed = QueueSkipBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    try {
      const args: Parameters<typeof queue.skip>[0] = {
        id: parsed.data.id,
        resolvedBy: parsed.data.resolvedBy,
      };
      if (parsed.data.note !== undefined) args.note = parsed.data.note;
      const item = queue.skip(args);
      return { item };
    } catch (err) {
      return reply.code(409).send({
        error: "queue_skip_failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
