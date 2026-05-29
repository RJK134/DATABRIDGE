/**
 * Findings routes (Phase K).
 *
 *   POST /findings/waivers/ack        (K1 — acknowledge a finding)
 *   POST /findings/waivers/waive      (K1 — waive until date with reason)
 *   POST /findings/waivers/revoke     (K1 — revoke an earlier decision)
 *   GET  /findings/waivers            (K1 — list current waivers/acks)
 *   POST /findings/delta              (K2 — diff two run snapshots)
 *   POST /findings/severity-by-surface (K3 — surface × severity rollup)
 *   POST /findings/reproduce          (K4 — predicate + canonical + target)
 *
 * The waiver store is process-local — production deployments would back
 * it with the AuditStore. K4 wires a stateless reproducer; callers can
 * POST a finding plus optional inline native / canonical / target stubs.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuditFinding, RuleSeverity } from "@databridge/rule-core";
import { FindingWaiverStore, WaiverError, applyWaiver } from "@databridge/finding-waivers";
import { computeFindingDelta, summariseDeltaMd } from "@databridge/finding-delta";
import {
  aggregateSeverityBySurface,
  reportToMd,
  type Surface,
} from "@databridge/severity-by-surface";
import {
  FindingReproducer,
  type CanonicalProvider,
  type NativeRowProvider,
  type TargetShapeProvider,
} from "@databridge/finding-reproducer";

// Shared store instance.
const waivers = new FindingWaiverStore();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const RuleSeverityZ = z.enum(["CRITICAL", "ERROR", "WARN", "INFO"]);
const FindingStatusZ = z.enum([
  "open",
  "in_review",
  "resolved",
  "accepted_risk",
  "false_positive",
  "waived",
]);
const RuleProvenanceZ = z.object({
  kind: z.enum(["sql", "fn", "expression"]),
  predicate: z.string(),
  binds: z.record(z.unknown()).optional(),
});

const FindingZ = z.object({
  id: z.string(),
  tenantId: z.string(),
  ruleId: z.string(),
  ruleName: z.string(),
  severity: RuleSeverityZ,
  entityType: z.string(),
  subjectId: z.string(),
  message: z.string(),
  evidence: z.record(z.unknown()),
  status: FindingStatusZ,
  detectedAt: z.string(),
  resolvedAt: z.string().optional(),
  resolvedBy: z.string().optional(),
  resolutionNote: z.string().optional(),
  lineageEdgeId: z.string().optional(),
  sourceSystem: z.string().optional(),
  nativeKeys: z.record(z.union([z.string(), z.number()])).optional(),
  ruleProvenance: RuleProvenanceZ.optional(),
  runId: z.string().optional(),
  waivedUntil: z.string().optional(),
  waiverReason: z.string().optional(),
});

const AckBodyZ = z.object({
  findingId: z.string().min(1),
  actor: z.string().min(1),
  reason: z.string().optional(),
});
const WaiveBodyZ = z.object({
  findingId: z.string().min(1),
  actor: z.string().min(1),
  reason: z.string().min(1),
  waivedUntil: z.string().min(1),
});
const RevokeBodyZ = z.object({
  findingId: z.string().min(1),
  actor: z.string().min(1),
  reason: z.string().optional(),
});

const DeltaBodyZ = z.object({
  previous: z.array(FindingZ),
  current: z.array(FindingZ),
  emitMd: z.boolean().default(false),
});

const SeverityBySurfaceBodyZ = z.object({
  findings: z.array(FindingZ),
  surfaceMap: z.record(z.string()).optional(),
  emitMd: z.boolean().default(false),
});

const ReproduceBodyZ = z.object({
  finding: FindingZ,
  /** Inline overrides — used in stateless calls. */
  nativeRow: z.record(z.unknown()).optional(),
  canonical: z.record(z.unknown()).optional(),
  target: z
    .object({
      targetSystem: z.string(),
      table: z.string(),
      payload: z.record(z.unknown()),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Helpers — convert validated zod records to typed records that satisfy
// the AuditFinding interface under exactOptionalPropertyTypes.
// ---------------------------------------------------------------------------
function toFinding(parsed: z.infer<typeof FindingZ>): AuditFinding {
  const f: AuditFinding = {
    id: parsed.id,
    tenantId: parsed.tenantId,
    ruleId: parsed.ruleId,
    ruleName: parsed.ruleName,
    severity: parsed.severity as RuleSeverity,
    entityType: parsed.entityType,
    subjectId: parsed.subjectId,
    message: parsed.message,
    evidence: parsed.evidence,
    status: parsed.status,
    detectedAt: parsed.detectedAt,
  };
  if (parsed.resolvedAt !== undefined) f.resolvedAt = parsed.resolvedAt;
  if (parsed.resolvedBy !== undefined) f.resolvedBy = parsed.resolvedBy;
  if (parsed.resolutionNote !== undefined) f.resolutionNote = parsed.resolutionNote;
  if (parsed.lineageEdgeId !== undefined) f.lineageEdgeId = parsed.lineageEdgeId;
  if (parsed.sourceSystem !== undefined) f.sourceSystem = parsed.sourceSystem;
  if (parsed.nativeKeys !== undefined) f.nativeKeys = parsed.nativeKeys;
  if (parsed.ruleProvenance !== undefined) {
    const rp: AuditFinding["ruleProvenance"] = {
      kind: parsed.ruleProvenance.kind,
      predicate: parsed.ruleProvenance.predicate,
    };
    if (parsed.ruleProvenance.binds !== undefined) {
      rp!.binds = parsed.ruleProvenance.binds;
    }
    f.ruleProvenance = rp;
  }
  if (parsed.runId !== undefined) f.runId = parsed.runId;
  if (parsed.waivedUntil !== undefined) f.waivedUntil = parsed.waivedUntil;
  if (parsed.waiverReason !== undefined) f.waiverReason = parsed.waiverReason;
  return f;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
export async function findingsRoutes(app: FastifyInstance): Promise<void> {
  // K1 -----------------------------------------------------------------
  app.post("/findings/waivers/ack", async (req, reply) => {
    const parsed = AckBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    const args: {
      findingId: string;
      actor: string;
      reason?: string;
    } = { findingId: parsed.data.findingId, actor: parsed.data.actor };
    if (parsed.data.reason !== undefined) args.reason = parsed.data.reason;
    const decision = waivers.ack(args);
    return { decision };
  });

  app.post("/findings/waivers/waive", async (req, reply) => {
    const parsed = WaiveBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    try {
      const decision = waivers.waive({
        findingId: parsed.data.findingId,
        actor: parsed.data.actor,
        reason: parsed.data.reason,
        waivedUntil: parsed.data.waivedUntil,
      });
      return { decision };
    } catch (err) {
      if (err instanceof WaiverError) {
        return reply.code(400).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post("/findings/waivers/revoke", async (req, reply) => {
    const parsed = RevokeBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    try {
      const args: {
        findingId: string;
        actor: string;
        reason?: string;
      } = {
        findingId: parsed.data.findingId,
        actor: parsed.data.actor,
      };
      if (parsed.data.reason !== undefined) args.reason = parsed.data.reason;
      const decision = waivers.revoke(args);
      return { decision };
    } catch (err) {
      if (err instanceof WaiverError) {
        return reply.code(400).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.get("/findings/waivers", async (req) => {
    const q = req.query as { activeOnly?: string; at?: string };
    const filter: { activeOnly?: boolean; at?: string } = {};
    if (q?.activeOnly === "true") filter.activeOnly = true;
    if (q?.at) filter.at = q.at;
    return {
      records: waivers.list(filter),
      stats: waivers.stats(filter.at),
    };
  });

  // K2 -----------------------------------------------------------------
  app.post("/findings/delta", async (req, reply) => {
    const parsed = DeltaBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    const previous = parsed.data.previous.map(toFinding);
    const current = parsed.data.current.map(toFinding);
    const delta = computeFindingDelta(previous, current);
    const body: { delta: typeof delta; md?: string } = { delta };
    if (parsed.data.emitMd) body.md = summariseDeltaMd(delta);
    return body;
  });

  // K3 -----------------------------------------------------------------
  app.post("/findings/severity-by-surface", async (req, reply) => {
    const parsed = SeverityBySurfaceBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    const findings = parsed.data.findings.map(toFinding);
    const opts: { surfaceMap?: Record<string, Surface> } = {};
    if (parsed.data.surfaceMap !== undefined) {
      const m: Record<string, Surface> = {};
      const allowed = new Set<Surface>([
        "admissions",
        "programmes",
        "enrolments",
        "results",
        "awards",
        "finance",
        "visa",
        "other",
      ]);
      for (const [k, v] of Object.entries(parsed.data.surfaceMap)) {
        if (allowed.has(v as Surface)) m[k] = v as Surface;
      }
      opts.surfaceMap = m;
    }
    const report = aggregateSeverityBySurface(findings, opts);
    const body: { report: typeof report; md?: string } = { report };
    if (parsed.data.emitMd) body.md = reportToMd(report);
    return body;
  });

  // K4 -----------------------------------------------------------------
  app.post("/findings/reproduce", async (req, reply) => {
    const parsed = ReproduceBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    const finding = toFinding(parsed.data.finding);

    // Build inline providers from supplied stubs.
    const nativeProviders: NativeRowProvider[] = [];
    if (parsed.data.nativeRow !== undefined) {
      const row = parsed.data.nativeRow;
      nativeProviders.push({
        handles: () => true,
        fetch: async () => row,
      });
    }
    const canonicalProviders: CanonicalProvider[] = [];
    if (parsed.data.canonical !== undefined) {
      const rec = parsed.data.canonical;
      canonicalProviders.push({
        handles: () => true,
        fetch: async () => rec,
      });
    }
    const targetProviders: TargetShapeProvider[] = [];
    if (parsed.data.target !== undefined) {
      const t = parsed.data.target;
      targetProviders.push({
        handles: () => true,
        fetch: async () => t,
      });
    }

    const reproducer = new FindingReproducer({
      nativeProviders,
      canonicalProviders,
      targetProviders,
    });
    const bundle = await reproducer.reproduce(finding);
    return { bundle };
  });

  // Demonstration helper: apply current waivers to a posted batch.
  app.post("/findings/waivers/apply", async (req, reply) => {
    const ApplyBodyZ = z.object({
      findings: z.array(FindingZ),
      at: z.string().optional(),
    });
    const parsed = ApplyBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    const at = parsed.data.at ?? new Date().toISOString();
    const projected = parsed.data.findings.map((raw) => {
      const f = toFinding(raw);
      const rec = waivers.get(f.id);
      return applyWaiver(f, rec, at);
    });
    return { findings: projected };
  });
}
