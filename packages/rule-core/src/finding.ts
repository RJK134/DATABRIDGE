import { z } from "zod";
import type { RuleSeverity } from "./types.js";

export const AuditFindingStatusZ = z.enum([
  "open",
  "in_review",
  "resolved",
  "accepted_risk",
  "false_positive",
  "waived",
]);
export type AuditFindingStatus = z.infer<typeof AuditFindingStatusZ>;

/**
 * Rule provenance — Phase G addition. Captures *how* a finding was
 * generated so reviewers can reproduce it without re-reading the engine.
 *
 * - `sql`: literal SQL predicate (sql-executor-pg.ts rules)
 * - `fn`: TypeScript function id (fn-runner.ts rules)
 * - `expression`: declarative predicate string (future profile DSL)
 */
export interface RuleProvenance {
  kind: "sql" | "fn" | "expression";
  /** Verbatim predicate / function id / expression text. */
  predicate: string;
  /** Optional bind params used at evaluation time. */
  binds?: Record<string, unknown>;
}

export interface AuditFinding {
  id: string;
  tenantId: string;
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  /** Canonical entity type, e.g. "Student", "Enrolment" */
  entityType: string;
  /** ID of the affected canonical record */
  subjectId: string;
  /** Human-readable finding message */
  message: string;
  /** Supporting evidence (field values, stats, etc.) */
  evidence: Record<string, unknown>;
  status: AuditFindingStatus;
  /** ISO 8601 timestamp */
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  /** Source row lineage reference */
  lineageEdgeId?: string;

  // ─ Phase G additions ─────────────────────────────────────────────────────────────────────
  /** Source system that owns the offending row (e.g. "banner-oracle"). */
  sourceSystem?: string;
  /** Native primary keys of the offending row, per source semantics. */
  nativeKeys?: Record<string, string | number>;
  /** How this rule was authored — SQL / fn / expression + the text itself. */
  ruleProvenance?: RuleProvenance;
  /** Run id (audit invocation) this finding belongs to. */
  runId?: string;
  /** Optional waiver expiry — used by Phase K bulk-acknowledge workflow. */
  waivedUntil?: string;
  /** Reason provided when the finding was waived. */
  waiverReason?: string;
}

/** Factory — creates an AuditFinding from a SQL rule row. */
export function findingFromSqlRow(
  params: {
    ruleId: string;
    ruleName: string;
    severity: RuleSeverity;
    entityType: string;
    row: Record<string, unknown>;
    messageTemplate: string;
    tenantId: string;
    sourceSystem?: string;
    nativeKeys?: Record<string, string | number>;
    ruleProvenance?: RuleProvenance;
    runId?: string;
  }
): AuditFinding {
  const message = params.messageTemplate.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => String(params.row[key] ?? "")
  );

  const finding: AuditFinding = {
    id: crypto.randomUUID(),
    tenantId: params.tenantId,
    ruleId: params.ruleId,
    ruleName: params.ruleName,
    severity: params.severity,
    entityType: params.entityType,
    subjectId: String(params.row["subject_id"] ?? ""),
    message,
    evidence: params.row,
    status: "open",
    detectedAt: new Date().toISOString(),
  };
  if (params.sourceSystem !== undefined) finding.sourceSystem = params.sourceSystem;
  if (params.nativeKeys !== undefined) finding.nativeKeys = params.nativeKeys;
  if (params.ruleProvenance !== undefined) finding.ruleProvenance = params.ruleProvenance;
  if (params.runId !== undefined) finding.runId = params.runId;
  return finding;
}
