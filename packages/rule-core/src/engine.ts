import type {
  AuditRule,
  RuleEvalContext,
  CodelistAuditRule,
  StatisticalAuditRule,
  FnAuditRule,
} from "./types.js";
import type { AuditFinding } from "./finding.js";
import { findingFromSqlRow } from "./finding.js";

export interface RuleEngineOptions {
  /** Max number of findings to emit per rule per run (prevents flooding) */
  maxFindingsPerRule?: number;
  /** If true, stop on first CRITICAL finding */
  failFast?: boolean;
}

export interface RuleRunResult {
  ruleId: string;
  durationMs: number;
  findingsEmitted: number;
  error?: string;
}

export interface EngineRunSummary {
  tenantId: string;
  startedAt: string;
  completedAt: string;
  rulesEvaluated: number;
  rulesFailed: number;
  findingsTotal: number;
  findingsBySeverity: Record<string, number>;
  results: RuleRunResult[];
}

/**
 * RuleEngine — evaluates a set of AuditRules and emits AuditFindings.
 *
 * SQL rules delegate to the provided `sqlExecutor`.
 * Codelist rules use the code lists in the context.
 * LLM rules delegate to ctx.llm (must have PII redaction applied).
 */
export class RuleEngine {
  constructor(
    private readonly sqlExecutor: SqlExecutor,
    private readonly opts: RuleEngineOptions = {}
  ) {}

  async run(
    rules: AuditRule[],
    ctx: RuleEvalContext,
    onFinding: (finding: AuditFinding) => Promise<void>
  ): Promise<EngineRunSummary> {
    const startedAt = new Date().toISOString();
    const results: RuleRunResult[] = [];
    const findingsBySeverity: Record<string, number> = {};
    let findingsTotal = 0;
    let rulesFailed = 0;

    for (const rule of rules) {
      if (ctx.signal.aborted) break;

      const t0 = Date.now();
      let findingsEmitted = 0;
      let error: string | undefined;

      try {
        const findings = await this.evaluateRule(rule, ctx);
        const limited = this.opts.maxFindingsPerRule
          ? findings.slice(0, this.opts.maxFindingsPerRule)
          : findings;

        for (const finding of limited) {
          await onFinding(finding);
          findingsEmitted++;
          findingsBySeverity[finding.severity] = (findingsBySeverity[finding.severity] ?? 0) + 1;
        }

        findingsTotal += findingsEmitted;

        if (this.opts.failFast && findingsBySeverity["CRITICAL"]) break;
      } catch (err) {
        rulesFailed++;
        error = err instanceof Error ? err.message : String(err);
      }

      const runResult: RuleRunResult = {
        ruleId: rule.id,
        durationMs: Date.now() - t0,
        findingsEmitted,
      };
      if (error !== undefined) runResult.error = error;
      results.push(runResult);
    }

    return {
      tenantId: ctx.tenantId,
      startedAt,
      completedAt: new Date().toISOString(),
      rulesEvaluated: rules.length,
      rulesFailed,
      findingsTotal,
      findingsBySeverity,
      results,
    };
  }

  private async evaluateRule(rule: AuditRule, ctx: RuleEvalContext): Promise<AuditFinding[]> {
    switch (rule.type) {
      case "sql":
        return this.evalSqlRule(rule, ctx);
      case "codelist":
        return this.evalCodelistRule(rule, ctx);
      case "statistical":
        return this.evalStatisticalRule(rule, ctx);
      case "llm":
        // LLM rules are dispatched to the AI Agent Runtime — stub here
        return [];
      case "fn":
      case undefined:
        // Function-evaluated rules are executed by profile-pack runners,
        // not the SQL-backed RuleEngine. They are accepted here as a no-op
        // so a mixed rule list does not throw — the profile runner is
        // responsible for iterating records and invoking `rule.evaluate`.
        return this.evalFnRule(rule as FnAuditRule, ctx);
      default:
        throw new Error(`Unknown rule type: ${(rule as { type?: string }).type}`);
    }
  }

  private async evalFnRule(_rule: FnAuditRule, _ctx: RuleEvalContext): Promise<AuditFinding[]> {
    // Intentional no-op: profile packs (e.g. profile-hesa-tdp) execute
    // FnAuditRules in their own iteration loop over candidate records.
    return [];
  }

  private async evalSqlRule(
    rule: Extract<AuditRule, { type: "sql" }>,
    ctx: RuleEvalContext
  ): Promise<AuditFinding[]> {
    const rows = await this.sqlExecutor.query(rule.sql, {
      tenantId: ctx.tenantId,
    });
    return rows.map((row) =>
      findingFromSqlRow({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        entityType: rule.id.split("-")[0] ?? "unknown",
        row,
        messageTemplate: rule.messageTemplate,
        tenantId: ctx.tenantId,
      })
    );
  }

  private async evalCodelistRule(
    rule: CodelistAuditRule,
    ctx: RuleEvalContext
  ): Promise<AuditFinding[]> {
    const codeList = ctx.codeLists.get(rule.codelistId);
    if (!codeList) {
      throw new Error(`Code list not found: ${rule.codelistId}`);
    }
    // Delegate to SQL executor with codelist validation logic
    const validCodes = new Set(codeList.entries.map((e) => e.code));
    const rows = await this.sqlExecutor.queryCodelistViolations(
      rule.fieldPath,
      validCodes,
      rule.flagNulls,
      ctx.tenantId
    );
    return rows.map((row) =>
      findingFromSqlRow({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        entityType: rule.fieldPath.split(".")[0] ?? "unknown",
        row,
        messageTemplate: `Field '${rule.fieldPath}' value '{{value}}' is not a valid ${rule.codelistId} code`,
        tenantId: ctx.tenantId,
      })
    );
  }

  private async evalStatisticalRule(
    rule: StatisticalAuditRule,
    ctx: RuleEvalContext
  ): Promise<AuditFinding[]> {
    const stats = await this.sqlExecutor.queryFieldStats(rule.fieldPath, ctx.tenantId);
    const findings: AuditFinding[] = [];

    if (rule.maxNullPct !== undefined && stats.nullPct > rule.maxNullPct) {
      findings.push(
        findingFromSqlRow({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          entityType: rule.fieldPath.split(".")[0] ?? "unknown",
          row: { subject_id: "aggregate", field: rule.fieldPath, null_pct: stats.nullPct },
          messageTemplate: `Field '${rule.fieldPath}' null rate {{null_pct}}% exceeds threshold ${rule.maxNullPct}%`,
          tenantId: ctx.tenantId,
        })
      );
    }
    return findings;
  }
}

/** SqlExecutor interface — implemented by apps/api with real Postgres client */
export interface SqlExecutor {
  query(
    sql: string,
    params: { tenantId: string } & Record<string, unknown>
  ): Promise<Record<string, unknown>[]>;

  queryCodelistViolations(
    fieldPath: string,
    validCodes: Set<string>,
    flagNulls: boolean,
    tenantId: string
  ): Promise<Record<string, unknown>[]>;

  queryFieldStats(fieldPath: string, tenantId: string): Promise<FieldStats>;
}

export interface FieldStats {
  nullPct: number;
  cardinality: number;
  min?: string;
  max?: string;
  mean?: number;
  stddev?: number;
  topValues: Array<{ value: string; count: number }>;
}
