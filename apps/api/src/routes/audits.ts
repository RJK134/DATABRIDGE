/**
 * Audit routes
 *
 *   POST   /audits/run    — start a new audit run for a given profile/tenant
 *   GET    /audits        — list audit records (newest first; tenant filter)
 *   GET    /audits/:id    — fetch a single audit record (with report when done)
 *
 * Phase E1 scope:
 *   - Synchronous run. The route awaits AuditEngine.runAudit() and returns
 *     the full report. This is fine for moderate audit volumes and keeps
 *     the surface simple; a future phase will hand off via QueueAdapter.
 *   - SQL executor is wired to PgSqlExecutor when DATABASE_URL is set; if
 *     absent we degrade to a noop executor that returns no rows, so Fn-only
 *     profiles still work without a Postgres.
 *   - Source adapter wiring is left to a follow-up — Fn rules without a
 *     source are skipped with a warning (AuditEngine handles this).
 *
 * No persistence yet — see audit-store.ts for in-memory storage.
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { auditStore, type AuditRecord } from "../audit-store.js";
import { requireRole } from "../middleware/auth.js";
import type { AuditQueue } from "../audit-queue.js";
import { cancelAudit } from "../audit-runner.js";
import { findProfile } from "../profile-registry.js";
import { findAdapter } from "../adapter-registry.js";
import { auditProgress, isTerminalStatus, type AuditProgressEvent } from "../audit-progress.js";

/* ---------------------------- request schema ------------------------------ */

const RunAuditBodyZ = z.object({
  profileId: z.string().min(1),
  tenantId: z.string().min(1),
  /** Optional caller-supplied audit id (must be unique). */
  auditId: z.string().min(1).optional(),
  /** Optional cap on findings per rule. */
  maxFindingsPerRule: z.number().int().positive().optional(),
  /** Optional cap on total findings emitted by Fn runner. */
  maxFindingsTotal: z.number().int().positive().optional(),
  /**
   * Optional adapter wiring. When provided AND the profile has Fn rules,
   * AuditEngine will pull rows from this adapter so Fn rules can fire.
   */
  adapterId: z.string().min(1).optional(),
  adapterConfig: z.record(z.unknown()).optional(),
  /** Map source-system resource (table/endpoint) → canonical entity name. */
  resourceMap: z.record(z.string()).optional(),
  /** Optional PK column per resource (else id/subject_id/pk fallback). */
  primaryKeyMap: z.record(z.string()).optional(),
  /** Optional source-system page size hint passed to streamRows. */
  pageSize: z.number().int().positive().optional(),
});

type RunAuditBody = z.infer<typeof RunAuditBodyZ>;

/* ----------------------------- RBAC helpers ------------------------------- */

/**
 * Resolve the tenant id from the POST body for /audits/run. The body is
 * unparsed at preHandler time — we read it raw and let the route handler
 * re-validate with zod.
 */
function resolveTenantFromBody(req: FastifyRequest): string | undefined {
  const body = req.body as { tenantId?: unknown } | undefined;
  if (body && typeof body.tenantId === "string") return body.tenantId;
  return undefined;
}

/**
 * Resolve the tenant id from the querystring for GET /audits list. When
 * absent the requireRole helper returns 403 — we require callers to scope
 * list requests to a tenant so we don't accidentally fan out across tenants
 * for a non-superadmin principal.
 */
function resolveTenantFromQuery(req: FastifyRequest): string | undefined {
  const q = req.query as { tenantId?: unknown } | undefined;
  if (q && typeof q.tenantId === "string") return q.tenantId;
  return undefined;
}

/**
 * Poll the audit store for a record to reach a terminal state
 * (succeeded/failed/cancelled). Used by sync-mode in tests so the existing
 * audits.test.ts suite doesn't need to be rewritten to handle 202+poll.
 *
 * Returns the final record, or undefined on timeout.
 */
async function waitForTerminalState(
  auditId: string,
  timeoutMs: number
): Promise<AuditRecord | undefined> {
  const start = Date.now();
  const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
  while (Date.now() - start < timeoutMs) {
    const rec = await auditStore.get(auditId);
    if (rec && TERMINAL.has(rec.status)) return rec;
    // Tight loop initially, then back off slightly. setImmediate keeps the
    // event loop responsive between polls.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return undefined;
}

/* ------------------------------- routes ----------------------------------- */

export interface AuditRoutesOptions {
  /** Queue used to dispatch audit jobs. Required: created at server bootstrap. */
  queue: AuditQueue;
  /**
   * Synchronous mode flag — when true POST /audits/run awaits the queue's
   * job to complete and returns 200 + full report. Default false (202).
   * Off by default; the test suite flips it on to keep the existing
   * sync-style integration tests working without rewriting them.
   */
  awaitCompletion?: boolean;
}

export async function auditRoutes(
  app: FastifyInstance,
  routeOpts: AuditRoutesOptions
): Promise<void> {
  // POST /audits/run — requires write authority. data:steward and
  // migration:operator are both legitimate — stewards run quality audits,
  // operators run pre-migration audits.
  const requireRunner = requireRole({
    resolveTenantId: resolveTenantFromBody,
    anyOf: ["data:steward", "migration:operator"],
  });
  const requireListReader = requireRole({
    resolveTenantId: resolveTenantFromQuery,
    anyOf: ["audit:viewer", "data:viewer", "data:steward"],
  });

  app.post<{ Body: RunAuditBody }>(
    "/audits/run",
    { preHandler: requireRunner },
    async (req, reply) => {
      const parsed = RunAuditBodyZ.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      }
      const body = parsed.data;

      // 404-up-front when the profile doesn't exist so clients don't get a
      // 202 + later-failed audit for typos.
      const profileEntry = findProfile(body.profileId);
      if (!profileEntry) {
        return reply.code(404).send({ error: "profile_not_found", id: body.profileId });
      }
      // Fail fast on unknown adapter id rather than spending a queue slot.
      // Adapter construction (which can read config) is still deferred to
      // the job; we only check that the id is registered.
      if (body.adapterId !== undefined && !findAdapter(body.adapterId)) {
        return reply.code(400).send({
          error: "adapter_init_failed",
          message: `adapter '${body.adapterId}' not registered`,
        });
      }

      const auditId =
        body.auditId ??
        // Avoid pulling in another uuid lib — Node 20+ has crypto.randomUUID.
        (await import("node:crypto")).randomUUID();

      const record: AuditRecord = await auditStore.create({
        auditId,
        tenantId: body.tenantId,
        profileId: body.profileId,
        status: "queued",
      });

      const jobInput = {
        auditId: record.auditId,
        tenantId: body.tenantId,
        profileId: body.profileId,
        ...(body.adapterId !== undefined ? { adapterId: body.adapterId } : {}),
        ...(body.adapterConfig !== undefined ? { adapterConfig: body.adapterConfig } : {}),
        ...(body.resourceMap !== undefined ? { resourceMap: body.resourceMap } : {}),
        ...(body.primaryKeyMap !== undefined ? { primaryKeyMap: body.primaryKeyMap } : {}),
        ...(body.pageSize !== undefined ? { pageSize: body.pageSize } : {}),
        ...(body.maxFindingsPerRule !== undefined
          ? { maxFindingsPerRule: body.maxFindingsPerRule }
          : {}),
        ...(body.maxFindingsTotal !== undefined ? { maxFindingsTotal: body.maxFindingsTotal } : {}),
      };

      try {
        await routeOpts.queue.enqueue(jobInput);
      } catch (err) {
        const message = (err as Error).message ?? String(err);
        await auditStore.update(record.auditId, {
          status: "failed",
          error: `enqueue failed: ${message}`,
        });
        return reply.code(500).send({
          error: "enqueue_failed",
          auditId: record.auditId,
          message,
        });
      }

      // Sync-mode for tests: wait until the record reaches a terminal state.
      if (routeOpts.awaitCompletion) {
        const final = await waitForTerminalState(record.auditId, 30_000);
        if (!final) {
          return reply.code(504).send({
            error: "audit_run_timeout",
            auditId: record.auditId,
          });
        }
        return reply.code(200).send(final);
      }

      return reply.code(202).header("location", `/audits/${record.auditId}`).send({
        auditId: record.auditId,
        status: "queued",
        tenantId: record.tenantId,
        profileId: record.profileId,
      });
    }
  );

  // POST /audits/:id/cancel — thin wrapper around the runner registry.
  // Used by F4. RBAC mirrors the run endpoint (only stewards/operators).
  app.post<{ Params: { id: string } }>(
    "/audits/:id/cancel",
    {
      preHandler: async (req, reply) => {
        // Look up the audit to resolve its tenant, then run requireRole.
        const rec = await auditStore.get(req.params.id);
        if (!rec) {
          return reply.code(404).send({ error: "audit_not_found", id: req.params.id });
        }
        const handler = requireRole({
          resolveTenantId: () => rec.tenantId,
          anyOf: ["data:steward", "migration:operator"],
        });
        await handler(req, reply);
      },
    },
    async (req, reply) => {
      const aborted = cancelAudit(req.params.id, "cancelled via /audits/:id/cancel");
      if (!aborted) {
        // The audit is not in-flight — either it never started, already
        // finished, or was already cancelled. We return 200 either way so
        // the call is idempotent; the body indicates whether anything was
        // actually aborted.
        return reply.code(200).send({ auditId: req.params.id, aborted: false });
      }
      return reply.code(202).send({ auditId: req.params.id, aborted: true });
    }
  );

  app.get<{ Querystring: { tenantId?: string } }>(
    "/audits",
    { preHandler: requireListReader },
    async (req) => {
      const tenantId = req.query.tenantId;
      const filter = tenantId !== undefined ? { tenantId } : undefined;
      return { audits: await auditStore.list(filter) };
    }
  );

  // GET /audits/:id/stream — Server-Sent Events. Streams every status
  // transition the runner publishes (queued → running → terminal) plus a
  // periodic heartbeat comment so intermediaries don't kill idle connections.
  // The endpoint terminates when the audit reaches a terminal state.
  //
  // Auth: same surface as GET /audits/:id — viewer roles in the record's
  // tenant, or superadmin. We apply RBAC at the handler since we need the
  // record first to resolve the tenant.
  app.get<{ Params: { id: string } }>("/audits/:id/stream", async (req, reply) => {
    const rec = await auditStore.get(req.params.id);
    if (!rec) {
      return reply.code(404).send({ error: "audit_not_found", id: req.params.id });
    }
    const principal = req.principal;
    if (principal) {
      const isSuper = principal.tenants.some((t) => t.roles.includes("system:superadmin"));
      if (!isSuper) {
        const membership = principal.tenants.find((t) => t.tenantId === rec.tenantId);
        const allowed = ["audit:viewer", "data:viewer", "data:steward"];
        const ok =
          membership !== undefined &&
          allowed.some((r) => membership.roles.includes(r as (typeof membership.roles)[number]));
        if (!ok) {
          return reply.code(403).send({
            error: "forbidden",
            message: `no viewer role in tenant ${rec.tenantId}`,
          });
        }
      }
    }

    // Switch to raw mode so we can write the SSE frames ourselves.
    // hijack() tells Fastify we own the response — it won't try to send
    // a reply when the handler returns, which would otherwise fight with
    // our direct reply.raw.write() / reply.raw.end() calls.
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");
    // Defeat proxy buffering (nginx etc.) so events arrive promptly.
    reply.raw.setHeader("x-accel-buffering", "no");
    reply.raw.flushHeaders?.();

    const auditId = req.params.id;
    let closed = false;

    const write = (ev: AuditProgressEvent | { __heartbeat: true }): void => {
      if (closed) return;
      if ("__heartbeat" in ev) {
        reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
        return;
      }
      const payload = JSON.stringify(ev);
      reply.raw.write(`event: progress\n`);
      reply.raw.write(`data: ${payload}\n\n`);
    };

    // Always send a synthetic 'snapshot' event with the current record
    // shape so clients have a usable baseline before any live event.
    write({
      auditId,
      ts: new Date().toISOString(),
      status: rec.status,
      ...(rec.error !== undefined ? { message: rec.error } : {}),
    });

    // If the audit is already terminal, close immediately.
    if (isTerminalStatus(rec.status)) {
      reply.raw.write("event: end\ndata: {}\n\n");
      reply.raw.end();
      return;
    }

    // Heartbeat every 15s so proxies and clients can detect liveness.
    // Declared first so the subscription callback can clear it.
    const heartbeatTimer = setInterval(() => {
      write({ __heartbeat: true });
    }, 15_000);
    // Don't keep the event loop alive just for the heartbeat.
    heartbeatTimer.unref?.();

    // Subscribe to live events. Replays buffered history first — the
    // callback can run synchronously, including for a terminal event, so
    // we use a forward-declared `let` to avoid a TDZ when the listener
    // calls unsubscribe() during the initial replay tick.
    let unsubscribe: () => void = () => {};
    let terminated = false;
    unsubscribe = auditProgress.subscribe(auditId, (ev) => {
      if (terminated) return;
      write(ev);
      if (isTerminalStatus(ev.status)) {
        terminated = true;
        reply.raw.write("event: end\ndata: {}\n\n");
        closed = true;
        unsubscribe();
        clearInterval(heartbeatTimer);
        reply.raw.end();
      }
    });

    // Cleanup when the client disconnects.
    req.raw.on("close", () => {
      closed = true;
      unsubscribe();
      clearInterval(heartbeatTimer);
    });

    // We've hijacked the reply; nothing to return.
    return;
  });

  // GET /audits/:id — we can't resolve the tenant until we've fetched the
  // record, so we apply auth at the handler level. Principals must either be
  // a system:superadmin or hold a viewer role in the record's tenant.
  app.get<{ Params: { id: string } }>("/audits/:id", async (req, reply) => {
    const rec = await auditStore.get(req.params.id);
    if (!rec) {
      return reply.code(404).send({ error: "audit_not_found", id: req.params.id });
    }
    const principal = req.principal;
    if (principal) {
      const isSuper = principal.tenants.some((t) => t.roles.includes("system:superadmin"));
      if (!isSuper) {
        const membership = principal.tenants.find((t) => t.tenantId === rec.tenantId);
        const allowedRoles = ["audit:viewer", "data:viewer", "data:steward"];
        const ok =
          membership !== undefined &&
          allowedRoles.some((r) =>
            membership.roles.includes(r as (typeof membership.roles)[number])
          );
        if (!ok) {
          return reply.code(403).send({
            error: "forbidden",
            message: `no viewer role in tenant ${rec.tenantId}`,
          });
        }
      }
    }
    return rec;
  });
}
