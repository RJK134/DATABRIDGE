/**
 * Public types for the migration runner (J3).
 */
import type { SampledRow } from "@databridge/adapter-spec";

/** A single inbound row plus its source-system metadata. */
export interface SourceRow {
  /** Entity name (e.g. "stu", "sce", "scj", "spriden"). */
  entity: string;
  /** Raw source row as read by the source adapter. */
  data: SampledRow;
  /** Optional source row id for provenance traceability. */
  sourceId?: string;
}

/** A successful or skipped transform output, before write. */
export interface TransformedRow {
  /** Target-side entity name. */
  targetEntity: string;
  /** Row payload as it should appear on the target. */
  payload: SampledRow;
  /** Provenance trail recorded for this row. */
  provenance: ProvenanceEntry[];
}

/** Provenance entry — one decision recorded during transform. */
export interface ProvenanceEntry {
  /** Which policy slot drove this decision (e.g. "crnGenerator", "gradeScheme"). */
  slot: string;
  /** Strategy that was applied (e.g. "monotonic"). */
  strategy: string;
  /** Free-form note for audit. */
  note: string;
  /** Optional input value the decision was made against. */
  inputValue?: string | number | null;
  /** Optional output value the decision produced. */
  outputValue?: string | number | null;
}

/** A rollback log entry — recorded after commit so rollbacks can replay. */
export interface RollbackEntry {
  entity: string;
  rowIndex: number;
  targetId: string;
  policyId: string;
  committedAt: string;
}

/** A diff entry returned by a dry-run. */
export interface DryRunDiff {
  entity: string;
  rowIndex: number;
  /** Operation that would be performed. */
  op: "create" | "update" | "skip";
  /** Reason for the operation (e.g. "validation-pass", "validation-error", "policy-skip"). */
  reason: string;
  /** Payload that would be written. */
  payload: SampledRow;
  /** Validation errors if op == "skip" because of validation. */
  errors?: { field: string; message: string }[];
  /** Provenance trail. */
  provenance: ProvenanceEntry[];
}

/** Final run summary. */
export interface MigrationRunReport {
  policyId: string;
  migrationRunId: string;
  sourceSystem: string;
  targetSystem: string;
  dryRun: boolean;
  totals: {
    sourceRowCount: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    validationErrors: number;
  };
  diffs: DryRunDiff[];
  rollbackLog: RollbackEntry[];
  /** Operational-input queue keys that need Registry follow-up (e.g. classification gaps). */
  operationalQueue: { entity: string; field: string; sourceId?: string; reason: string }[];
}
