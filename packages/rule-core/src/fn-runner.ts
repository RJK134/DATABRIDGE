/**
 * FnRuleRunner — evaluates FnAuditRules against a stream of canonical records.
 *
 * Purpose:
 *   profile-hesa-tdp's ~40 rules and profile-sits' cross-record rules are all
 *   shaped as `FnAuditRule.evaluate({ value, record, context })`. The base
 *   RuleEngine in engine.ts intentionally no-ops on Fn rules — they need to be
 *   iterated per-record, not delegated to a SQL executor. FnRuleRunner is the
 *   per-record iterator that closes that gap.
 *
 * Design:
 *   - Rules are partitioned by their declared `entity` (e.g. "Student",
 *     "Engagement"). Rules without an entity run against every record.
 *   - The runner consumes an AsyncIterable<EntityRow> so it can drive directly
 *     off a SourceAdapter.streamRows() pipeline without buffering.
 *   - For each record, every applicable rule is invoked with the conventional
 *     evaluate input shape `{ value, record, context }`. `value` is the field
 *     value at `rule.field` (or the whole record if no field is declared).
 *   - Findings are emitted via a callback so the caller controls persistence
 *     (write to AuditReport, stream to UI, etc.).
 *   - Per-rule findings are capped via `maxFindingsPerRule` to prevent
 *     pathological rules from drowning the output. Total cap via
 *     `maxFindingsTotal`. Both caps recorded in the summary as truncation
 *     indicators so downstream consumers can show a warning.
 *
 * Severity normalisation:
 *   Fn rules use the alias "WARNING" as well as the canonical "WARN".
 *   normaliseSeverity() collapses them to the canonical RuleSeverity union so
 *   the resulting AuditFinding always carries a clean value.
 */
import { randomUUID } from "node:crypto";
import type {
  FnAuditRule,
  FnRuleResult,
  RuleEvalContext,
  RuleSeverity,
} from "./types.js";
import type { AuditFinding } from "./finding.js";

export interface EntityRow {
  /** Canonical entity name, e.g. "Student". */
  entity: string;
  /** Stable subject id for the row (e.g. HUSID, internal pk). */
  subjectId: string;
  /** Raw record fields. */
  record: Record<string, unknown>;
}

export interface FnRunnerOptions {
  /** Per-rule cap on findings emitted (default: unlimited). */
  maxFindingsPerRule?: number;
  /** Total cap on findings across all rules (default: unlimited). */
  maxFindingsTotal?: number;
  /**
   * Optional cross-record context provider invoked once before iteration.
   * Used by referential-integrity rules that need e.g. a Set<HUSID>.
   */
  contextProvider?: (rows: ReadonlyArray<EntityRow>) => Record<string, unknown>;
}

export interface FnRunnerSummary {
  rowsProcessed: number;
  rulesEvaluated: number;
  rulesSkipped: number;
  findingsEmitted: number;
  findingsBySeverity: Record<RuleSeverity, number>;
  truncated: boolean;
  durationMs: number;
}

export type FindingSink = (finding: AuditFinding) => void | Promise<void>;

export class FnRuleRunner {
  constructor(private readonly opts: FnRunnerOptions = {}) {}

  async run(
    rules: ReadonlyArray<FnAuditRule>,
    rows: AsyncIterable<EntityRow> | Iterable<EntityRow>,
    ctx: RuleEvalContext,
    onFinding: FindingSink,
  ): Promise<FnRunnerSummary> {
    const t0 = Date.now();
    const summary: FnRunnerSummary = {
      rowsProcessed: 0,
      rulesEvaluated: 0,
      rulesSkipped: 0,
      findingsEmitted: 0,
      findingsBySeverity: emptySeverityCounts(),
      truncated: false,
      durationMs: 0,
    };

    // Partition rules by entity so per-row dispatch is O(applicableRules)
    const byEntity = new Map<string, FnAuditRule[]>();
    const universal: FnAuditRule[] = [];
    for (const rule of rules) {
      if (typeof rule.evaluate !== "function") {
        summary.rulesSkipped++;
        continue;
      }
      if (rule.entity && rule.entity.length > 0) {
        const bucket = byEntity.get(rule.entity) ?? [];
        bucket.push(rule);
        byEntity.set(rule.entity, bucket);
      } else {
        universal.push(rule);
      }
    }

    const findingsPerRule = new Map<string, number>();
    // Optional pre-pass: build cross-record context. Needs the rows in memory
    // so only enable when caller passed a contextProvider. We materialise into
    // an array in that path.
    let materialisedRows: EntityRow[] | undefined;
    let context: Record<string, unknown> = {};
    if (this.opts.contextProvider) {
      materialisedRows = [];
      for await (const r of rows) materialisedRows.push(r);
      context = this.opts.contextProvider(materialisedRows);
    }
    const iter: AsyncIterable<EntityRow> | Iterable<EntityRow> =
      materialisedRows ?? rows;

    outer: for await (const row of iter) {
      if (ctx.signal.aborted) break;
      summary.rowsProcessed++;

      const applicable = [
        ...(byEntity.get(row.entity) ?? []),
        ...universal,
      ];

      for (const rule of applicable) {
        if (
          this.opts.maxFindingsTotal !== undefined &&
          summary.findingsEmitted >= this.opts.maxFindingsTotal
        ) {
          summary.truncated = true;
          break outer;
        }
        const perRuleCount = findingsPerRule.get(rule.id) ?? 0;
        if (
          this.opts.maxFindingsPerRule !== undefined &&
          perRuleCount >= this.opts.maxFindingsPerRule
        ) {
          summary.truncated = true;
          continue;
        }
        summary.rulesEvaluated++;
        const result = invokeRule(rule, row, context);
        if (result.pass) continue;
        const finding = buildFinding(rule, row, result);
        await onFinding(finding);
        summary.findingsEmitted++;
        summary.findingsBySeverity[finding.severity] =
          (summary.findingsBySeverity[finding.severity] ?? 0) + 1;
        findingsPerRule.set(rule.id, perRuleCount + 1);
      }
    }

    summary.durationMs = Date.now() - t0;
    return summary;
  }
}

function invokeRule(
  rule: FnAuditRule,
  row: EntityRow,
  context: Record<string, unknown>,
): FnRuleResult {
  const value =
    rule.field !== undefined ? row.record[rule.field] : undefined;
  try {
    const input = { value, record: row.record, context };
    // Some rules in profile-hesa-tdp destructure {value}, others {record} or
    // {value, context}. The structural input shape covers all three.
    const result = rule.evaluate(input);
    if (result && typeof (result as FnRuleResult).pass === "boolean") {
      return result as FnRuleResult;
    }
    return { pass: true };
  } catch (err) {
    return {
      pass: false,
      message: `rule '${rule.id}' threw: ${(err as Error).message}`,
      detail: { error: (err as Error).name },
    };
  }
}

function buildFinding(
  rule: FnAuditRule,
  row: EntityRow,
  result: FnRuleResult,
): AuditFinding {
  const severity = normaliseSeverity(rule.severity);
  const evidence: Record<string, unknown> = { ...(result.detail ?? {}) };
  if (rule.field !== undefined) {
    evidence["field"] = rule.field;
    evidence["value"] = row.record[rule.field];
  }
  return {
    id: randomUUID(),
    tenantId: "", // assigned by caller (AuditEngine knows tenant)
    ruleId: rule.id,
    ruleName: rule.name ?? rule.label ?? rule.id,
    severity,
    entityType: row.entity,
    subjectId: row.subjectId,
    message: result.message ?? rule.description,
    evidence,
    status: "open",
    detectedAt: new Date().toISOString(),
  };
}

export function normaliseSeverity(s: RuleSeverity | "WARNING"): RuleSeverity {
  return s === "WARNING" ? "WARN" : s;
}

function emptySeverityCounts(): Record<RuleSeverity, number> {
  return { CRITICAL: 0, ERROR: 0, WARN: 0, INFO: 0 };
}
