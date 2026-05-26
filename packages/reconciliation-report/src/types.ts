/**
 * Cross-system reconciliation report — types.
 */
import type {
  MatchCandidate,
  PersonRecord,
  SourceSystemTag,
} from "@databridge/identity-reconciler";

/** Summary counts. */
export interface ReconciliationCounts {
  matched: number;
  sourceAOnly: number;
  sourceBOnly: number;
  conflicting: number;
  totalA: number;
  totalB: number;
}

/** A single matched pair (1:1 after de-duplication). */
export interface MatchedPair {
  a: PersonRecord;
  b: PersonRecord;
  candidate: MatchCandidate;
  /** Field-level disagreements between the two records. */
  conflicts: FieldConflict[];
}

/** One field-level disagreement. */
export interface FieldConflict {
  field: string;
  valueA?: string;
  valueB?: string;
}

/** Full report shape. */
export interface ReconciliationReport {
  /** ISO 8601 datetime the report was generated. */
  generatedAt: string;
  systemA: SourceSystemTag;
  systemB: SourceSystemTag;
  counts: ReconciliationCounts;
  matched: MatchedPair[];
  /** Records present in A but not matched to anything in B. */
  sourceAOnly: PersonRecord[];
  /** Records present in B but not matched to anything in A. */
  sourceBOnly: PersonRecord[];
}
