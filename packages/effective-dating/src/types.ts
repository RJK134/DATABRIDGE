/**
 * Effective-dating resolvers — shared types.
 *
 * Every adapter exposes a row type that varies — what stays uniform is
 * the *pattern* it uses to track time:
 *
 *   activity-dated    — Banner `ACTIVITY_DATE` row history; most-recent
 *                       row before `at` wins.
 *   term-keyed        — Banner `TERM_CODE_EFF`; row is effective from a
 *                       term. Caller maps term → date externally and we
 *                       behave like activity-dated.
 *   from-to-dated     — explicit `validFrom` / `validTo` columns. Row
 *                       wins if `validFrom <= at < validTo` (or validTo
 *                       absent).
 *   change-indicator  — Banner `SPRIDEN.CHANGE_IND IS NULL` denotes the
 *                       current row; older rows have a non-null change
 *                       indicator.
 *   status-driven     — SITS "active + current ayr" dual-column scheme.
 *                       Row wins when its `status` is in `activeStatuses`
 *                       AND its `ayr` equals `currentAyr`.
 *   snapshot          — one row, no history. Returned verbatim.
 *
 * Every resolver returns the *winning* row plus a normalised
 * `EffectiveDating` metadata block compatible with `@databridge/canonical`.
 */
import type { EffectiveDating, EffectiveDatingPattern } from "@databridge/canonical";

export type { EffectiveDating, EffectiveDatingPattern };

/** A raw row, plus the pattern-specific columns the resolver needs. */
export interface ActivityDatedRow {
  /** ISO 8601 datetime / date. */
  activityDate: string;
  [key: string]: unknown;
}

export interface FromToDatedRow {
  validFrom: string;
  /** Absent = open-ended. */
  validTo?: string;
  [key: string]: unknown;
}

export interface ChangeIndicatorRow {
  /** Non-null = historical row; null/undefined/empty = current. */
  changeIndicator?: string | null;
  /** Optional activity date used for tie-breaking among historicals. */
  activityDate?: string;
  [key: string]: unknown;
}

export interface StatusDrivenRow {
  /** SITS status code (e.g. `stac` value). */
  status: string;
  /** Academic year code (e.g. `ayrc` value). */
  ayr: string;
  [key: string]: unknown;
}

export interface TermKeyedRow {
  /** Caller-supplied date that the term effectively begins. */
  termEffectiveDate: string;
  [key: string]: unknown;
}

export interface SnapshotRow {
  [key: string]: unknown;
}

/** A row plus its resolved effective-dating metadata. */
export interface ResolvedRow<R> {
  row: R;
  effectiveDating: EffectiveDating;
}
