/**
 * Audit job runner \u2014 the side-effecting work that used to live inline in the
 * POST /audits/run handler. Splitting this out lets us:
 *
 *   - Dispatch audits via a queue (InProcess or pg-boss) instead of blocking
 *     the HTTP request (see audit-queue.ts).
 *   - Reuse the exact same logic for a CLI runner or scheduled job later.
 *   - Wire cancellation: the runner registers its AbortController in a
 *     module-level registry keyed by auditId, and exposes cancelAudit() so
 *     downstream endpoints (F4) can abort an in-flight run.
 *
 * The function is intentionally pure-input / fire-and-forget: it never
 * throws. All errors are persisted to the store as status=failed.
 */
import {
  AuditEngine,
  PgSqlExecutor,
  type AuditRule,
  type FnAuditRule,
  type RuleEvalContext,
  type SqlExecutor,
  type FieldStats,
  type AuditReport,
} from "@databridge/rule-core";
import type { SourceAdapter, AdapterContext } from "@databridge/adapter-spec";

import { findProfile } from "./profile-registry.js";
import { findAdapter } from "./adapter-registry.js";
import { auditStore } from "./audit-store.js";
import { auditProgress } from "./audit-progress.js";

/* --------------------------- public types --------------------------- */

export interface AuditJobInput {
  auditId: string;
  tenantId: string;
  profileId: string;
  /** Optional adapter wiring \u2014 same shape as the HTTP body. */
  adapterId?: string;
  adapterConfig?: Record<string, unknown>;
  resourceMap?: Record<string, string>;
  primaryKeyMap?: Record<string, string>;
  pageSize?: number;
  maxFindingsPerRule?: number;
  maxFindingsTotal?: number;
}

export interface AuditRunnerLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  child?: (bindings: Record<string, unknown>) => AuditRunnerLogger;
}

/** Outcome bubbled up to the queue layer for telemetry only. */
export type AuditJobOutcome =
  | { status: "succeeded"; findingsTotal: number }
  | { status: "failed"; error: string }
  | { status: "cancelled" };

/* ------------------- abort controller registry ---------------------- */

/**
 * Module-level registry of in-flight audit runs. F4's cancel endpoint
 * looks up the controller here. We can't keep this on the Fastify instance
 * because the same audit may be triggered by a queue worker running in a
 * different request scope.
 */
const inflight = new Map<string, AbortController>();

/** Return true if a controller existed and was aborted. */
export function cancelAudit(auditId: string, reason?: string): boolean {
  const ctrl = inflight.get(auditId);
  if (!ctrl) return false;
  ctrl.abort(new Error(reason ?? "cancelled by user"));
  return true;
}

/** Test helper: drop any tracked controllers between suites. */
export function _clearInflightForTests(): void {
  inflight.clear();
}

/** Read-only view for diagnostics / tests. */
export function inflightAuditIds(): string[] {
  return Array.from(inflight.keys());
}

/* ----------------------- internal helpers --------------------------- */

class NoopSqlExecutor implements SqlExecutor {
  async query(): Promise<Record<string, unknown>[]> {
    return [];
  }
  async queryCodelistViolations(): Promise<Record<string, unknown>[]> {
    return [];
  }
  async queryFieldStats(): Promise<FieldStats> {
    return { nullPct: 0, cardinality: 0, topValues: [] };
  }
}

function makeExecutor(): SqlExecutor {
  const url = process.env["DATABASE_URL"];
  if (url) return new PgSqlExecutor({ connectionString: url });
  return new NoopSqlExecutor();
}

function makeAdapterContext(
  tenantId: string,
  connectionId: string,
  signal: AbortSignal,
  log: AuditRunnerLogger
): AdapterContext {
  return {
    tenantId,
    connectionId,
    secrets: {
      async get(key: string) {
        const v = process.env[key];
        if (v === undefined) throw new Error(`secret '${key}' not found in env`);
        return v;
      },
    },
    logger: {
      info: (m, meta) => log.info(m, meta),
      warn: (m, meta) => log.warn(m, meta),
      error: (m, meta) => log.error(m, meta),
      debug: (m, meta) => log.debug(m, meta),
    },
    signal,
  };
}

function instantiateAdapter(
  id: string,
  config: Record<string, unknown> | undefined
): SourceAdapter | { error: string } {
  const entry = findAdapter(id);
  if (!entry) return { error: `adapter '${id}' not registered` };
  try {
    return new entry.Adapter(config ?? {});
  } catch (err) {
    return { error: (err as Error).message };
  }
}

function getRulesFromProfile(profile: unknown): (AuditRule | FnAuditRule)[] {
  const p = profile as { rules?: unknown };
  if (!Array.isArray(p.rules)) return [];
  return p.rules as (AuditRule | FnAuditRule)[];
}

/* ---------------------------- runner -------------------------------- */

/**
 * Execute one audit job. Never throws \u2014 all error paths persist
 * status=failed/cancelled to the audit store.
 *
 * Preconditions:
 *   - An AuditRecord with input.auditId already exists in the store with
 *     status='running' or 'queued'. The HTTP handler creates it before
 *     enqueueing so GET /audits/:id is visible immediately.
 */
export async function runAuditJob(
  input: AuditJobInput,
  log: AuditRunnerLogger
): Promise<AuditJobOutcome> {
  // 1. Resolve the profile.
  const profileEntry = findProfile(input.profileId);
  if (!profileEntry) {
    const msg = `profile not found: ${input.profileId}`;
    await auditStore.update(input.auditId, { status: "failed", error: msg });
    auditProgress.publish({
      auditId: input.auditId,
      ts: new Date().toISOString(),
      status: "failed",
      message: msg,
    });
    return { status: "failed", error: msg };
  }
  const rules = getRulesFromProfile(profileEntry.profile);

  // 2. Register abort controller for this run.
  const abort = new AbortController();
  inflight.set(input.auditId, abort);

  try {
    // 3. Flip status to running (no-op if already running) and publish.
    await auditStore.update(input.auditId, { status: "running" });
    auditProgress.publish({
      auditId: input.auditId,
      ts: new Date().toISOString(),
      status: "running",
    });

    // 4. Optional adapter.
    let source: SourceAdapter | undefined;
    let adapterCtx: AdapterContext | undefined;
    if (input.adapterId) {
      const made = instantiateAdapter(input.adapterId, input.adapterConfig);
      if ("error" in made) {
        await auditStore.update(input.auditId, {
          status: "failed",
          error: made.error,
        });
        auditProgress.publish({
          auditId: input.auditId,
          ts: new Date().toISOString(),
          status: "failed",
          message: made.error,
        });
        return { status: "failed", error: made.error };
      }
      // TS already narrowed `made` to SourceAdapter after the error branch above.
      source = made;
      const child = log.child
        ? log.child({ adapterId: input.adapterId, auditId: input.auditId })
        : log;
      adapterCtx = makeAdapterContext(
        input.tenantId,
        `audit:${input.auditId}`,
        abort.signal,
        child
      );
    }

    // 5. Engine.
    const engineOpts = {
      ...(input.maxFindingsPerRule !== undefined
        ? { maxFindingsPerRule: input.maxFindingsPerRule }
        : {}),
      ...(input.maxFindingsTotal !== undefined ? { maxFindingsTotal: input.maxFindingsTotal } : {}),
      ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {}),
    };
    const engine = new AuditEngine(makeExecutor(), engineOpts);
    const ctx: RuleEvalContext = {
      tenantId: input.tenantId,
      connectionId: `api:${input.profileId}`,
      codeLists: new Map(),
      signal: abort.signal,
    };

    let report: AuditReport;
    try {
      report = await engine.runAudit({
        auditId: input.auditId,
        tenantId: input.tenantId,
        rules,
        resourceMap: input.resourceMap ?? {},
        ...(input.primaryKeyMap !== undefined ? { primaryKeyMap: input.primaryKeyMap } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(adapterCtx !== undefined ? { adapterCtx } : {}),
        ctx,
      });
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      // Distinguish abort-driven cancellation from real failures.
      if (abort.signal.aborted) {
        await auditStore.update(input.auditId, {
          status: "cancelled",
          error: message,
        });
        auditProgress.publish({
          auditId: input.auditId,
          ts: new Date().toISOString(),
          status: "cancelled",
          message,
        });
        log.warn("audit cancelled", { auditId: input.auditId, message });
        return { status: "cancelled" };
      }
      await auditStore.update(input.auditId, {
        status: "failed",
        error: message,
      });
      auditProgress.publish({
        auditId: input.auditId,
        ts: new Date().toISOString(),
        status: "failed",
        message,
      });
      log.error("audit run failed", { auditId: input.auditId, message });
      return { status: "failed", error: message };
    }

    await auditStore.update(input.auditId, {
      status: "succeeded",
      report,
    });
    auditProgress.publish({
      auditId: input.auditId,
      ts: new Date().toISOString(),
      status: "succeeded",
      metrics: { findingsTotal: report.findingsTotal },
    });
    return { status: "succeeded", findingsTotal: report.findingsTotal };
  } finally {
    inflight.delete(input.auditId);
  }
}
