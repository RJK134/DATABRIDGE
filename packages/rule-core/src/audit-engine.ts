/**
 * AuditEngine — single orchestrator that produces an AuditReport from a
 * rule set, a SourceAdapter, and a SqlExecutor.
 *
 * Why this exists:
 *   - RuleEngine handles SQL/codelist/statistical/LLM rules (executor-driven).
 *   - FnRuleRunner handles Fn rules (row-stream-driven).
 *   - In production we need to run *both* against the same connection in
 *     one pass, attribute findings to a single tenant, and emit a single
 *     report. AuditEngine is that seam.
 *
 * Responsibilities:
 *   1. Partition the incoming AuditRule[] into SQL-family rules and Fn rules.
 *   2. Pull rows from the source adapter once (streamed in pages), partition
 *      pages into EntityRow[] for the Fn runner. Pages with no Fn rules are
 *      not held in memory.
 *   3. Run SQL-family rules via RuleEngine.
 *   4. Run Fn rules via FnRuleRunner over the row stream.
 *   5. Stamp every emitted finding with the audit's tenantId (FnRuleRunner
 *      leaves tenantId="" by contract).
 *   6. Aggregate the results into an AuditReport.
 *
 * This module does not persist anything. Callers (apps/api routes, CLI)
 * are responsible for handing the report to a store.
 */

import { randomUUID } from "node:crypto";
import type { SourceAdapter, AdapterContext, SampledRow } from "@databridge/adapter-spec";

import type { AuditRule, FnAuditRule, RuleEvalContext } from "./types.js";
import type { AuditFinding } from "./finding.js";
import { RuleEngine, type SqlExecutor, type EngineRunSummary } from "./engine.js";
import {
  FnRuleRunner,
  type EntityRow,
  type FnRunnerOptions,
  type FnRunnerSummary,
} from "./fn-runner.js";

/* ------------------------------- types ------------------------------------ */

/**
 * Mapping from source-adapter resource (table/endpoint name) to the
 * canonical HERM-style entity that rules target. The audit caller knows
 * the mapping; AuditEngine does not assume one.
 *
 * Example:
 *   { STU: "Student", SRS: "Engagement", LEAVER: "Leaver" }
 *
 * The runner pulls rows for every key in this map.
 */
export type ResourceEntityMap = Record<string, string>;

/**
 * Best-effort PK column per resource (used to populate subjectId in
 * EntityRow). If a resource is missing here, AuditEngine looks for
 * conventional columns: id, subject_id, pk; failing that, falls back to
 * a deterministic synthetic id "<resource>:<rowIndex>".
 */
export type PrimaryKeyMap = Record<string, string>;

export interface AuditEngineOptions {
  /** Page size requested from the adapter's streamRows(). */
  pageSize?: number;
  /** Cap on findings per rule (passed through to both runners). */
  maxFindingsPerRule?: number;
  /** Cap on findings emitted overall by the Fn runner. */
  maxFindingsTotal?: number;
  /** Optional context provider passed to FnRuleRunner (ref-integrity Sets). */
  contextProvider?: FnRunnerOptions["contextProvider"];
  /**
   * Per-resource paging concurrency cap. When > 1, resources in resourceMap
   * are paged in parallel via a bounded worker pool; their row streams are
   * merged into a single AsyncIterable fed to FnRuleRunner.
   *
   * Default: 1 (sequential — matches pre-E3 ordering).
   *
   * Notes:
   *   - Concurrency > 1 only helps when the adapter's network/IO can be
   *     parallelised. SitsFileAdapter currently yields empty pages so the
   *     benefit is theoretical there.
   *   - Cross-record contextProvider forces materialisation, so concurrency
   *     only affects the streaming path.
   */
  resourceConcurrency?: number;
}

export interface RunAuditArgs {
  /** Audit id. If omitted a UUID is generated. */
  auditId?: string;
  /** Tenant attribution for every finding. */
  tenantId: string;
  /** Rules to evaluate. Mixed SQL/Fn lists are supported. */
  rules: AuditRule[];
  /** Map of source resource → canonical entity name. */
  resourceMap: ResourceEntityMap;
  /** PK column per source resource, used to extract subjectId. */
  primaryKeyMap?: PrimaryKeyMap;
  /** Rule eval context (tenantId/codeLists/signal etc). */
  ctx: RuleEvalContext;
  /** Source adapter — used only if Fn rules are present. */
  source?: SourceAdapter;
  /** Adapter context — required if source is provided. */
  adapterCtx?: AdapterContext;
}

/**
 * Complete result of a single audit run. Serialisable to JSON.
 */
export interface AuditReport {
  auditId: string;
  tenantId: string;
  startedAt: string;
  completedAt: string;
  rulesTotal: number;
  rulesSql: number;
  rulesFn: number;
  rowsScanned: number;
  findingsTotal: number;
  findingsBySeverity: Record<string, number>;
  findings: AuditFinding[];
  sqlSummary?: EngineRunSummary;
  fnSummary?: FnRunnerSummary;
  /** Warnings the engine raised that did not abort the run. */
  warnings: string[];
}

/* ----------------------------- helpers ------------------------------------ */

function isFnRule(rule: AuditRule | FnAuditRule): rule is FnAuditRule {
  // FnAuditRule lacks a `type` discriminator (or carries type: "fn") and
  // exposes a function `evaluate`. SqlAuditRule etc. all carry a literal
  // `type` in { sql, codelist, statistical, llm }.
  const t = (rule as { type?: string }).type;
  if (t && t !== "fn") return false;
  return typeof (rule as { evaluate?: unknown }).evaluate === "function";
}

function pickSubjectId(
  row: SampledRow,
  resource: string,
  pkMap: PrimaryKeyMap | undefined,
  fallbackIndex: number
): string {
  const explicitKey = pkMap?.[resource];
  const candidates: string[] = [];
  if (explicitKey) candidates.push(explicitKey);
  candidates.push("id", "subject_id", "pk");

  for (const k of candidates) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return `${resource}:${fallbackIndex}`;
}

/* ----------------------------- AuditEngine -------------------------------- */

export class AuditEngine {
  constructor(
    private readonly sqlExecutor: SqlExecutor,
    private readonly opts: AuditEngineOptions = {}
  ) {}

  async runAudit(args: RunAuditArgs): Promise<AuditReport> {
    const auditId = args.auditId ?? randomUUID();
    const startedAt = new Date().toISOString();
    const warnings: string[] = [];

    // 1. Partition rules.
    const fnRules: FnAuditRule[] = [];
    const sqlFamilyRules: AuditRule[] = [];
    for (const r of args.rules) {
      if (isFnRule(r)) fnRules.push(r as FnAuditRule);
      else sqlFamilyRules.push(r);
    }

    const findings: AuditFinding[] = [];
    const findingsBySeverity: Record<string, number> = {};
    const sink = (f: AuditFinding): void => {
      // Stamp tenantId here — FnRuleRunner leaves it as "" by contract.
      const stamped: AuditFinding = f.tenantId ? f : { ...f, tenantId: args.tenantId };
      findings.push(stamped);
      const sev = stamped.severity;
      findingsBySeverity[sev] = (findingsBySeverity[sev] ?? 0) + 1;
    };

    // 2. Run SQL-family rules.
    let sqlSummary: EngineRunSummary | undefined;
    if (sqlFamilyRules.length > 0) {
      const engineOpts =
        this.opts.maxFindingsPerRule !== undefined
          ? { maxFindingsPerRule: this.opts.maxFindingsPerRule }
          : {};
      const engine = new RuleEngine(this.sqlExecutor, engineOpts);
      sqlSummary = await engine.run(sqlFamilyRules, args.ctx, async (f) => {
        sink(f);
      });
    }

    // 3. Run Fn rules over a streamed row scan, if any.
    let fnSummary: FnRunnerSummary | undefined;
    let rowsScanned = 0;
    if (fnRules.length > 0) {
      if (!args.source || !args.adapterCtx) {
        warnings.push(
          `audit has ${fnRules.length} Fn rule(s) but no source/adapterCtx was provided — Fn rules skipped`
        );
      } else {
        const runnerOpts: FnRunnerOptions = {
          ...(this.opts.maxFindingsPerRule !== undefined
            ? { maxFindingsPerRule: this.opts.maxFindingsPerRule }
            : {}),
          ...(this.opts.maxFindingsTotal !== undefined
            ? { maxFindingsTotal: this.opts.maxFindingsTotal }
            : {}),
          ...(this.opts.contextProvider ? { contextProvider: this.opts.contextProvider } : {}),
        };

        // True streaming path: count rows as they flow through to the runner.
        // We wrap streamRows() in a counting iterable so rowsScanned reflects
        // exactly the rows the Fn runner consumed (including aborted runs).
        const counter = { n: 0 };
        const rowStream = this.countingIterable(
          this.streamRows(args.source, args.adapterCtx, args.resourceMap, args.primaryKeyMap),
          counter
        );

        const runner = new FnRuleRunner(runnerOpts);
        fnSummary = await runner.run(fnRules, rowStream, args.ctx, sink);
        rowsScanned = counter.n;
      }
    }

    const completedAt = new Date().toISOString();
    const report: AuditReport = {
      auditId,
      tenantId: args.tenantId,
      startedAt,
      completedAt,
      rulesTotal: args.rules.length,
      rulesSql: sqlFamilyRules.length,
      rulesFn: fnRules.length,
      rowsScanned,
      findingsTotal: findings.length,
      findingsBySeverity,
      findings,
      warnings,
      ...(sqlSummary ? { sqlSummary } : {}),
      ...(fnSummary ? { fnSummary } : {}),
    };
    return report;
  }

  /**
   * Stream rows for every resource declared in resourceMap. Yields EntityRow
   * one at a time so FnRuleRunner can iterate without buffering. Honours
   * adapterCtx.signal for early abort.
   *
   * Per-resource concurrency is controlled by opts.resourceConcurrency:
   *   1 (default) — resources are paged sequentially in resourceMap order.
   *   >1          — resources are paged in parallel using a bounded merge.
   */
  private async *streamRows(
    source: SourceAdapter,
    adapterCtx: AdapterContext,
    resourceMap: ResourceEntityMap,
    pkMap: PrimaryKeyMap | undefined
  ): AsyncGenerator<EntityRow, void, unknown> {
    const entries = Object.entries(resourceMap);
    const concurrency = Math.max(1, this.opts.resourceConcurrency ?? 1);

    if (concurrency === 1 || entries.length <= 1) {
      for (const [resource, entity] of entries) {
        if (adapterCtx.signal.aborted) return;
        yield* this.streamResource(source, adapterCtx, resource, entity, pkMap);
      }
      return;
    }

    yield* mergeAsync(
      entries.map(([resource, entity]) =>
        this.streamResource(source, adapterCtx, resource, entity, pkMap)
      ),
      concurrency,
      adapterCtx.signal
    );
  }

  /**
   * Page through a single resource, yielding EntityRows one at a time.
   * Keeps cursor logic local so multiple resources can be paged in parallel
   * without sharing state.
   */
  private async *streamResource(
    source: SourceAdapter,
    adapterCtx: AdapterContext,
    resource: string,
    entity: string,
    pkMap: PrimaryKeyMap | undefined
  ): AsyncGenerator<EntityRow, void, unknown> {
    let cursor: string | undefined;
    let index = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (adapterCtx.signal.aborted) return;
      const streamArgs = {
        resource,
        ...(cursor !== undefined ? { cursor } : {}),
        ...(this.opts.pageSize !== undefined ? { pageSize: this.opts.pageSize } : {}),
      };
      const iter = source.streamRows(adapterCtx, streamArgs);
      let receivedAny = false;
      let nextCursor: string | undefined;
      for await (const page of iter) {
        receivedAny = true;
        for (const row of page.rows) {
          if (adapterCtx.signal.aborted) return;
          const subjectId = pickSubjectId(row, resource, pkMap, index);
          yield {
            entity,
            subjectId,
            record: row as Record<string, unknown>,
          };
          index++;
        }
        if (page.nextCursor !== undefined) nextCursor = page.nextCursor;
        else nextCursor = undefined;
        // Many adapters return one page per streamRows() call and expose
        // the next page via nextCursor; we break after the first yielded
        // page and re-issue streamRows() with the new cursor. This keeps
        // memory bounded even when the adapter's iterator never terminates.
        break;
      }
      if (!receivedAny) break;
      if (!nextCursor) break;
      cursor = nextCursor;
    }
  }

  /**
   * Wrap an AsyncIterable so consumed rows are counted. The counter object
   * is mutated in place — read counter.n after iteration ends.
   */
  private async *countingIterable<T>(
    iter: AsyncIterable<T>,
    counter: { n: number }
  ): AsyncGenerator<T, void, unknown> {
    for await (const x of iter) {
      counter.n++;
      yield x;
    }
  }
}

/* --------------------------- async merge helper ---------------------------- */

/**
 * Merge N async iterables into one, running up to `concurrency` at a time.
 * Order across iterables is non-deterministic — items appear as their
 * source generators produce them. Used for resource-level parallelism
 * during streaming row collection.
 *
 * Implementation note: we maintain a pool of in-flight `next()` promises
 * keyed by source index. When one resolves we yield the value and re-arm
 * that slot from the same source; when a source ends we replace it with
 * the next pending source (if any). This keeps exactly `concurrency`
 * generators active at all times until all are drained.
 */
async function* mergeAsync<T>(
  sources: AsyncGenerator<T, void, unknown>[],
  concurrency: number,
  signal: AbortSignal
): AsyncGenerator<T, void, unknown> {
  const pending = sources.slice();
  // Active slots: { source, promise }. promise resolves to {done,value,slot}
  interface Slot {
    source: AsyncGenerator<T, void, unknown>;
    promise: Promise<{ done: boolean; value: T | undefined; slotIdx: number }>;
  }
  const active: (Slot | null)[] = [];

  const armSlot = (slotIdx: number): void => {
    const slot = active[slotIdx];
    if (!slot) return;
    slot.promise = slot.source.next().then((r) => ({
      done: r.done === true,
      value: (r.done === true ? undefined : (r.value as T)) as T | undefined,
      slotIdx,
    }));
  };

  // Seed up to `concurrency` slots.
  const initial = Math.min(concurrency, pending.length);
  for (let i = 0; i < initial; i++) {
    const source = pending.shift();
    if (!source) break;
    const slot: Slot = {
      source,
      // placeholder; armSlot replaces it immediately
      promise: Promise.resolve({
        done: false,
        value: undefined as T | undefined,
        slotIdx: i,
      }),
    };
    active.push(slot);
    armSlot(i);
  }

  while (active.some((s) => s !== null)) {
    if (signal.aborted) return;
    const live = active
      .map((s, idx) => (s ? { promise: s.promise, idx } : null))
      .filter((x): x is { promise: Slot["promise"]; idx: number } => x !== null);
    if (live.length === 0) break;

    const winner = await Promise.race(live.map((l) => l.promise));
    const slot = active[winner.slotIdx];
    if (!slot) continue;

    if (winner.done) {
      // This source is drained — replace with the next pending, if any.
      const next = pending.shift();
      if (next) {
        active[winner.slotIdx] = { source: next, promise: slot.promise };
        armSlot(winner.slotIdx);
      } else {
        active[winner.slotIdx] = null;
      }
      continue;
    }

    yield winner.value as T;
    armSlot(winner.slotIdx);
  }
}
