import { z } from 'zod';

/**
 * Provenance primitives shared across canonical entities.
 *
 * Phase G of the DATABRIDGE roadmap (see DATABRIDGE_BANNER_SITS_GAP_ANALYSIS.md).
 * Three core ideas:
 *
 * 1. `AltId` — every canonical record can carry one or more source-system
 *    identifiers. Required to reconcile the same human/programme/module
 *    across Banner (PIDM) and SITS (mst_code) without collapsing identity.
 *    (Crosswalk §13 — "non-negotiable for parallel-run verification".)
 *
 * 2. `SourceKeys` — a structured map of native primary keys per source
 *    system. Lets migration preserve Banner CRN, SITS scj_code suffixes,
 *    composite (PIDM, TERM_CODE) keys, etc., without leaking them into
 *    canonical identity.
 *
 * 3. `EffectiveDating` — every effective-dated record exposes uniform
 *    `currentFrom` / `currentTo` and the source pattern that produced
 *    them, so downstream code never has to know which of Banner's four
 *    effective-dating shapes (activity / term / from-to / change-ind /
 *    status-driven) or SITS's dual-column "active+current" applies.
 */

/** Identifier of a known source system. Open enum — adapters declare their own. */
export const SourceSystemZ = z.enum([
  'banner-oracle',
  'banner-ethos',
  'sits-oracle',
  'sits-api',
  'sits-file',
  'workday-raas',
  'sjms5',
  'manual',
  'other',
]);
export type SourceSystem = z.infer<typeof SourceSystemZ>;

/** Categorisation of an alternate identifier. */
export const AltIdTypeZ = z.enum([
  // Banner identifiers
  'pidm',          // SPRIDEN_PIDM — internal numeric surrogate
  'banner-id',     // SPRIDEN_ID — visible alphanumeric
  // SITS identifiers
  'mst-code',      // INS_MST.mst_code — personal-master code
  'stu-code',      // INS_STU.stu_code — student code (often = mst_code)
  // HESA / national
  'husid',         // HESA Unique Student Identifier
  'ucas-pid',      // UCAS personal identifier
  'ownstu',        // Provider's own student id (HESA OWNSTU)
  // Generic
  'sourceId',      // generic source-system primary key
  'legacy',        // legacy / pre-migration identifier
  'other',
]);
export type AltIdType = z.infer<typeof AltIdTypeZ>;

/** A single alternate identifier for a canonical record. */
export const AltIdZ = z.object({
  system: SourceSystemZ,
  type: AltIdTypeZ,
  value: z.string().min(1),
  /** When this identifier was first observed (ISO 8601 datetime). */
  firstSeenAt: z.string().datetime().optional(),
  /** True if this identifier is the current "live" one in its source. */
  current: z.boolean().optional(),
});
export type AltId = z.infer<typeof AltIdZ>;

/**
 * SourceKeys — native composite primary keys per source system.
 *
 * Examples:
 *   sourceKeys.banner = { pidm: '82045', termCode: '202310', crn: '10243' }
 *   sourceKeys.sits   = { stuCode: '23123456', scjCode: '23123456/1', blok: '1' }
 *
 * Stored as `Record<string, Record<string, string>>` so each adapter can
 * include whatever native keys it needs without polluting the canonical
 * primary id space.
 */
export const SourceKeysZ = z.record(z.record(z.string()));
export type SourceKeys = z.infer<typeof SourceKeysZ>;

/** Effective-dating pattern observed at the source. */
export const EffectiveDatingPatternZ = z.enum([
  'activity-dated',   // ACTIVITY_DATE row-history (Banner most-recent wins)
  'term-keyed',       // TERM_CODE_EFF (Banner) — effective from a term
  'from-to-dated',    // explicit valid_from / valid_to columns
  'change-indicator', // SPRIDEN_CHANGE_IND IS NULL → current
  'status-driven',    // SITS stac + ayrc dual column "active + current ayr"
  'snapshot',         // single-row, no history kept
]);
export type EffectiveDatingPattern = z.infer<typeof EffectiveDatingPatternZ>;

/** Effective-dating metadata that travels with every effective-dated record. */
export const EffectiveDatingZ = z.object({
  pattern: EffectiveDatingPatternZ,
  /** When this version of the record became current. ISO 8601 date or datetime. */
  currentFrom: z.string().optional(),
  /** When this version of the record stopped being current. Open at the end if absent. */
  currentTo: z.string().optional(),
  /** True if this is the source-system's "current" row at observation time. */
  isCurrent: z.boolean().optional(),
});
export type EffectiveDating = z.infer<typeof EffectiveDatingZ>;

/**
 * ProvenanceFields — the bundle that every provenance-aware canonical
 * entity embeds. Apply via `.merge(ProvenanceFieldsZ)` in zod.
 */
export const ProvenanceFieldsZ = z.object({
  altIds: z.array(AltIdZ).optional(),
  sourceKeys: SourceKeysZ.optional(),
  effectiveDating: EffectiveDatingZ.optional(),
});
export type ProvenanceFields = z.infer<typeof ProvenanceFieldsZ>;
