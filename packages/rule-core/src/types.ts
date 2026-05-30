import type { CodeList } from "@databridge/adapter-spec";
import type { LlmAdapter } from "@databridge/platform";

/**
 * Rule severity levels aligned with HESA Data Futures validation.
 * CRITICAL → blocks HESA return submission
 * ERROR    → must be resolved before migration commit
 * WARN     → should be reviewed; does not block
 * INFO     → informational; logged for awareness
 */
export type RuleSeverity = "CRITICAL" | "ERROR" | "WARN" | "INFO";

/**
 * Rule families.
 *  - F01–F13: canonical-side audit families (docs/AUDIT_RULES.md)
 *  - SITS-INTEGRITY: source-native rules running against raw SITS:Vision
 *    tables (audit-pack-sits-native, SITS_DATA_STRUCTURES §19).
 *  - BANNER-INTEGRITY: source-native rules running against raw Banner
 *    tables (audit-pack-banner-native, BANNER_DATA_STRUCTURES §17).
 */
export type RuleFamily =
  | "F01"
  | "F02"
  | "F03"
  | "F04"
  | "F05"
  | "F06"
  | "F07"
  | "F08"
  | "F09"
  | "F10"
  | "F11"
  | "F12"
  | "F13"
  | "SITS-INTEGRITY"
  | "BANNER-INTEGRITY"
  | "WORKDAY-INTEGRITY"
  | "TECHONE-FIN1-INTEGRITY"
  | "SALESFORCE-EDU-NATIVE"
  | "DYNAMICS365-EDU-NATIVE";

/**
 * Base rule definition — all rule types extend this.
 */
export interface AuditRuleBase {
  id: string; // e.g. "F01-01"
  family: RuleFamily;
  name: string;
  description: string;
  severity: RuleSeverity;
  ucisa_benchmark_ref?: string;
  /** Tags for filtering, e.g. ["hesa-df", "sits", "migration"] */
  tags?: string[];
  /** Whether this rule is enabled by default for new tenants */
  enabledByDefault: boolean;
}

/**
 * Deterministic SQL rule — executes a SQL query against the canonical store.
 * Rows returned by the query are AuditFindings.
 */
export interface SqlAuditRule extends AuditRuleBase {
  type: "sql";
  /**
   * SQL template. Can reference:
   *   :tenantId  → bound parameter
   *   :entityTable  → resolved canonical entity table name
   * Returns rows; each row maps to one AuditFinding.
   * The row MUST include a `subject_id` column (the affected record's id).
   */
  sql: string;
  /** Human-readable template for finding message. Use {{fieldName}} for row values. */
  messageTemplate: string;
}

/**
 * Code-list conformance rule — checks a field value against a known code list.
 */
export interface CodelistAuditRule extends AuditRuleBase {
  type: "codelist";
  /** Canonical entity field path, e.g. "Student.sexId" */
  fieldPath: string;
  /** Code-list id to validate against, e.g. "HESA.SEXID" */
  codelistId: string;
  /** Whether null/empty values should be flagged (depends on field mandatory status) */
  flagNulls: boolean;
}

/**
 * Statistical anomaly rule — compares field statistics against expected thresholds.
 */
export interface StatisticalAuditRule extends AuditRuleBase {
  type: "statistical";
  fieldPath: string;
  /** Max acceptable null percentage (0–100) */
  maxNullPct?: number;
  /** Max acceptable cardinality for low-cardinality fields */
  maxCardinality?: number;
  /** Min acceptable cardinality */
  minCardinality?: number;
  /** Statistical outlier z-score threshold for numeric fields */
  outlierZScore?: number;
}

/**
 * LLM-judged rule — defers to an AI agent for ambiguous cases.
 * ALWAYS has human-approval requirement before any action is taken.
 */
export interface LlmAuditRule extends AuditRuleBase {
  type: "llm";
  /** Prompt template. Use {{fieldValue}}, {{context}} placeholders. */
  promptTemplate: string;
  /** Expected output schema name */
  outputSchema: "anomaly-finding" | "cleansing-proposal";
}

export type AuditRule =
  | SqlAuditRule
  | CodelistAuditRule
  | StatisticalAuditRule
  | LlmAuditRule
  | FnAuditRule;

/**
 * Function-evaluated audit rule — for coding-frame checks, cross-record
 * integrity, and other validations that do not fit cleanly into SQL.
 *
 * The `evaluate` callback receives either a record directly OR a context
 * object containing `{ value, record, context }`. Implementations should
 * accept either shape — see the `EvaluateInput` union below.
 *
 * Used by profile packs (e.g. profile-hesa-tdp) whose rules are best
 * expressed as inline TypeScript functions.
 */
export interface FnAuditRule {
  type?: "fn";
  id: string;
  /**
   * Rule family. Permissive string so profiles can use their own taxonomies
   * (e.g. "H01"-"H07" for HESA, "FORMAT"/"CODING"/"TEMPORAL" for generic
   * style rules) without needing to match the F01-F13 family enum.
   */
  family: RuleFamily | string;
  /**
   * Severity. Accepts the canonical RuleSeverity enum plus the alias
   * "WARNING" (treated equivalent to "WARN") for profile compatibility.
   */
  severity: RuleSeverity | "WARNING";
  /** Optional human-readable name; falls back to label/description. */
  name?: string;
  /** Short label, typically used in UI lists. */
  label?: string;
  description: string;
  /** Canonical entity name (e.g. "Student"). */
  entity?: string;
  /** Canonical field name (e.g. "HUSID"). */
  field?: string;
  /** UCISA benchmark cross-reference. May be null when no benchmark applies. */
  ucisa_benchmark_ref?: string | null;
  tags?: string[];
  enabledByDefault?: boolean;
  /**
   * Evaluation function. Accepts either a raw record or a structured input
   * object with optional `value`, `record`, `context` keys. Implementations
   * SHOULD accept whichever shape they need.
   *
   * Returns `FnRuleResult` synchronously. Async rules should be wired into
   * the engine via a separate async-evaluator rule variant rather than
   * returning a Promise here — keeping the synchronous shape lets profile
   * pack tests assert `.pass` directly without await.
   */
  evaluate: (input: any, context?: any) => FnRuleResult;
}

/** Result returned by a FnAuditRule.evaluate(). */
export interface FnRuleResult {
  pass: boolean;
  message?: string;
  /** Optional structured detail to attach to the AuditFinding. */
  detail?: Record<string, unknown>;
}

/**
 * Back-compat aliases used by profile packs. New code should prefer the
 * explicit `FnAuditRule` name.
 */
export type Rule = FnAuditRule;
export type RuleDefinition = FnAuditRule;

/**
 * Runtime context injected into every rule evaluation.
 */
export interface RuleEvalContext {
  tenantId: string;
  connectionId: string;
  /** Resolved code lists for codelist rules */
  codeLists: Map<string, CodeList>;
  /** LLM adapter (optional, only needed for llm rules) */
  llm?: LlmAdapter;
  /** Abort signal for long-running evaluations */
  signal: AbortSignal;
}
