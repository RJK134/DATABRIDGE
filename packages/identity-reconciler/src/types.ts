/**
 * Identity Reconciler — types.
 *
 * The reconciler ingests `PersonRecord` rows from multiple source systems
 * and produces `MatchCandidate` pairs with a normalised score, a list of
 * reasons, and a confidence band. Downstream callers can then auto-merge
 * `confident` candidates, queue `review` candidates for a human, and
 * discard `rejected` ones.
 *
 * The package is intentionally pure — no I/O, no database. Callers feed
 * arrays in and receive arrays out.
 */

/** Logical source system tag (matches `SourceSystem` in canonical/provenance). */
export type SourceSystemTag =
  | "sits"
  | "banner"
  | "workday"
  | "techone"
  | "sjms5"
  | "hesa"
  | "ucas"
  | "other";

/** Minimum shape needed to attempt identifier reconciliation. */
export interface PersonRecord {
  /** Source system this record came from. */
  system: SourceSystemTag;
  /** Native primary key inside that source system. */
  sourceId: string;
  /** Optional canonical id if the record is already in DATABRIDGE. */
  canonicalId?: string;

  // Identity fields (all optional except the bare minimum the matcher needs)
  firstName?: string;
  lastName?: string;
  middleNames?: string;
  /** Date of birth (YYYY-MM-DD). */
  dateOfBirth?: string;
  /** Primary email (lowercased for comparison). */
  email?: string;
  /** Optional postcode used for institutional matching. */
  postcode?: string;

  // National / cross-source identifiers (any of these match → strong signal)
  husid?: string;
  ucasPid?: string;
  ownStuId?: string;

  /** Free-form additional altIds from provenance (any duplicate signals match). */
  altIds?: Array<{ system: string; type: string; value: string }>;
}

/** Match policy — declaration of how strict the reconciliation should be. */
export type MatchPolicyKind = "exact" | "fuzzy" | "institutional";

export interface MatchPolicy {
  kind: MatchPolicyKind;
  /** Minimum score (0..1) to count as a match (default per kind). */
  threshold?: number;
  /** Optional ordered list of fields institutional policy must match exactly. */
  institutionalFields?: Array<keyof PersonRecord>;
  /** Fuzzy tolerance for first/last name (Damerau–Levenshtein distance). Default 1. */
  fuzzyNameDistance?: number;
}

/** Confidence band derived from score and the matcher's signal mix. */
export type MatchConfidence = "confident" | "review" | "rejected";

/** Reason fragment explaining why a pair was scored. */
export interface MatchReason {
  /** Short identifier of the rule (e.g. "husid-equal", "lastname-fuzzy"). */
  code: string;
  /** Human-readable description. */
  message: string;
  /** Per-rule weight contribution to the total score. */
  weight: number;
}

/** A single candidate match between two records. */
export interface MatchCandidate {
  a: PersonRecord;
  b: PersonRecord;
  policy: MatchPolicyKind;
  /** Score in [0, 1]. */
  score: number;
  confidence: MatchConfidence;
  reasons: MatchReason[];
}

/** Audit-log entry written when two records are merged. */
export interface MergeLogEntry {
  /** ISO 8601 timestamp the merge decision was taken. */
  decidedAt: string;
  /** The winning canonical id (kept). */
  keptCanonicalId: string;
  /** The losing canonical id (merged-into-keptCanonicalId). */
  mergedCanonicalId: string;
  /** The candidate that justified the merge. */
  candidate: MatchCandidate;
  /** Decided by — agent identifier (system | user email). */
  decidedBy: string;
}
