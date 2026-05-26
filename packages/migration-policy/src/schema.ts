/**
 * Migration-policy schema (J2).
 *
 * Ten policy slots, each modelled as a discriminated union where the
 * shape varies by `strategy`. Defaults are provided so an empty policy
 * file is still valid; callers that need stricter validation can use
 * `MigrationPolicyStrictZ`.
 *
 * The DSL is YAML-friendly but the loader parses JSON only — callers
 * that author YAML on disk should pre-parse with their preferred tool
 * (any modern Node project already pulls one in).
 */
import { z } from "zod";

// =====================================================================
// 1. CRN generator
// =====================================================================
export const CrnGeneratorZ = z.discriminatedUnion("strategy", [
  z.object({
    strategy: z.literal("monotonic"),
    /** First CRN to attempt. */
    start: z.number().int().positive().default(10_000),
    /** Pad with leading zeros to this width when stringifying. */
    width: z.number().int().min(0).max(10).default(5),
  }),
  z.object({
    strategy: z.literal("hash"),
    /** Hash bucket size; collisions bump into next bucket. */
    bucketSize: z.number().int().positive().default(99_999),
  }),
  z.object({
    /** Reuse the existing Banner CRN if SSBSECT already has a matching section. */
    strategy: z.literal("preserve-existing"),
    /** Fallback strategy when no existing CRN matches. */
    fallback: z.enum(["monotonic", "hash"]).default("monotonic"),
  }),
]);

// =====================================================================
// 2. scj_code attempt-number policy
// =====================================================================
export const ScjAttemptPolicyZ = z.discriminatedUnion("strategy", [
  z.object({
    /** Increment from "1" each time a new SCJ is created for an existing student. */
    strategy: z.literal("monotonic"),
    startAt: z.number().int().positive().default(1),
  }),
  z.object({
    /** Reset attempt number on each new academic year. */
    strategy: z.literal("reset-per-ayr"),
  }),
  z.object({
    /** Preserve attempt number sourced from upstream (e.g. SITS). */
    strategy: z.literal("source-preserved"),
  }),
]);

// =====================================================================
// 3. Multi-curriculum collapse
// =====================================================================
export const MultiCurriculumPolicyZ = z.discriminatedUnion("strategy", [
  z.object({
    /** Keep only the primary curriculum (Banner: SORLCUR with PRIORITY_NO=1). */
    strategy: z.literal("primary-only"),
  }),
  z.object({
    /** Preserve all curricula but flag them on the canonical record. */
    strategy: z.literal("preserve-all"),
  }),
  z.object({
    /** Collapse joint/double majors into a "combined" canonical programme. */
    strategy: z.literal("combine-joint"),
    /** Separator used between the constituent codes when combining. */
    separator: z.string().default("/"),
  }),
]);

// =====================================================================
// 4. Component-mark preservation
// =====================================================================
export const ComponentMarkPolicyZ = z.discriminatedUnion("strategy", [
  z.object({
    /** Always preserve component marks on the canonical record. */
    strategy: z.literal("preserve-in-canonical"),
    /** Whether to project the rolled-up final mark on target write. */
    projectOnWrite: z.boolean().default(true),
  }),
  z.object({
    /** Discard component marks; only retain the final mark. */
    strategy: z.literal("discard-components"),
  }),
]);

// =====================================================================
// 5. Credit-hour → CATS factor
// =====================================================================
export const CreditHourPolicyZ = z.object({
  /** CATS credits awarded per 1 source credit-hour. Default is 3.75 (4 CH = 15 CATS). */
  catsPerCreditHour: z.number().positive().default(3.75),
  /** Rounding: nearest integer is the convention. */
  rounding: z.enum(["nearest", "floor", "ceil"]).default("nearest"),
});

// =====================================================================
// 6. Grade-scheme conversion table
// =====================================================================
export const GradeSchemePolicyZ = z.object({
  /** Codeset-mapper map id used to resolve letter → numeric. */
  mapId: z.string().default("banner-stvgrde-to-numeric@1.0.0"),
  /** Behaviour when a code is missing from the map. */
  onMissing: z.enum(["fail", "warn", "skip"]).default("warn"),
});

// =====================================================================
// 7. term → academic-year function
// =====================================================================
export const TermToAcademicYearPolicyZ = z.discriminatedUnion("strategy", [
  z.object({
    /** Read directly from Banner STVTERM.ACYR_CODE. */
    strategy: z.literal("stvterm-driven"),
  }),
  z.object({
    /** Parse the term code with a regex and use captured groups. */
    strategy: z.literal("regex"),
    pattern: z.string().default("^(\\d{4})(\\d{2})$"),
    /** 1-based capture-group indexes for ayr-start and term-no. */
    yearGroup: z.number().int().positive().default(1),
    termGroup: z.number().int().positive().default(2),
    /** SITS-style "2024/5" formatting for the resulting ayrc. */
    ayrFormat: z.enum(["YYYY/Y", "YYYY-YYYY", "YYYY"]).default("YYYY/Y"),
  }),
]);

// =====================================================================
// 8. Fee-status mapping
// =====================================================================
export const FeeStatusPolicyZ = z.object({
  /** Codeset-mapper map id. */
  mapId: z.string().default("banner-stvresd-to-hesa-feestatus@1.0.0"),
  /** If true, unknown source codes default to "99" (unknown). */
  defaultToUnknown: z.boolean().default(true),
});

// =====================================================================
// 9. Classification gap behaviour
// =====================================================================
export const ClassificationGapPolicyZ = z.discriminatedUnion("strategy", [
  z.object({
    /** Skip the classification write when no UK band can be computed. */
    strategy: z.literal("skip"),
  }),
  z.object({
    /** Write an operational-input queue entry for Registry follow-up. */
    strategy: z.literal("queue-for-registry"),
  }),
  z.object({
    /** Apply a fixed band for all gaps. */
    strategy: z.literal("default-band"),
    /** UK classification band code (e.g. "21" for 2:1). */
    band: z.string().default("21"),
  }),
]);

// =====================================================================
// 10. Intercalation reconstruction
// =====================================================================
export const IntercalationPolicyZ = z.discriminatedUnion("strategy", [
  z.object({
    /** Detect intercalation from status transitions, reconstruct gaps. */
    strategy: z.literal("status-transition"),
    /** Status codes that represent an intercalation pause. */
    pauseStatuses: z.array(z.string()).default(["IT", "I"]),
  }),
  z.object({
    /** Use an explicit calendar table supplied externally. */
    strategy: z.literal("calendar-supplied"),
  }),
  z.object({
    /** Ignore intercalations and treat as continuous study. */
    strategy: z.literal("ignore"),
  }),
]);

// =====================================================================
// Top-level policy bundle
// =====================================================================
export const MigrationPolicyZ = z.object({
  /** Human-readable identifier (e.g. "uni-of-x@2026.1"). */
  id: z.string(),
  /** Free-form description. */
  description: z.string().optional(),
  /** Tenant id this policy applies to. */
  tenantId: z.string().optional(),
  /** Source system the migration runs from. */
  sourceSystem: z.enum(["sits", "banner", "workday", "techone", "sjms5"]),
  /** Target system the migration writes to. */
  targetSystem: z.enum(["sits", "banner", "workday", "techone", "sjms5"]),

  crnGenerator: CrnGeneratorZ,
  scjAttempt: ScjAttemptPolicyZ,
  multiCurriculum: MultiCurriculumPolicyZ,
  componentMark: ComponentMarkPolicyZ,
  creditHour: CreditHourPolicyZ,
  gradeScheme: GradeSchemePolicyZ,
  termToAcademicYear: TermToAcademicYearPolicyZ,
  feeStatus: FeeStatusPolicyZ,
  classificationGap: ClassificationGapPolicyZ,
  intercalation: IntercalationPolicyZ,
});

export type CrnGenerator = z.infer<typeof CrnGeneratorZ>;
export type ScjAttemptPolicy = z.infer<typeof ScjAttemptPolicyZ>;
export type MultiCurriculumPolicy = z.infer<typeof MultiCurriculumPolicyZ>;
export type ComponentMarkPolicy = z.infer<typeof ComponentMarkPolicyZ>;
export type CreditHourPolicy = z.infer<typeof CreditHourPolicyZ>;
export type GradeSchemePolicy = z.infer<typeof GradeSchemePolicyZ>;
export type TermToAcademicYearPolicy = z.infer<typeof TermToAcademicYearPolicyZ>;
export type FeeStatusPolicy = z.infer<typeof FeeStatusPolicyZ>;
export type ClassificationGapPolicy = z.infer<typeof ClassificationGapPolicyZ>;
export type IntercalationPolicy = z.infer<typeof IntercalationPolicyZ>;
export type MigrationPolicy = z.infer<typeof MigrationPolicyZ>;

/** Default policy fragments — used by the partial-loader to fill gaps. */
export const POLICY_DEFAULTS = {
  crnGenerator: { strategy: "monotonic" as const, start: 10_000, width: 5 },
  scjAttempt: { strategy: "monotonic" as const, startAt: 1 },
  multiCurriculum: { strategy: "primary-only" as const },
  componentMark: { strategy: "preserve-in-canonical" as const, projectOnWrite: true },
  creditHour: { catsPerCreditHour: 3.75, rounding: "nearest" as const },
  gradeScheme: { mapId: "banner-stvgrde-to-numeric@1.0.0", onMissing: "warn" as const },
  termToAcademicYear: { strategy: "stvterm-driven" as const },
  feeStatus: { mapId: "banner-stvresd-to-hesa-feestatus@1.0.0", defaultToUnknown: true },
  classificationGap: { strategy: "queue-for-registry" as const },
  intercalation: { strategy: "status-transition" as const, pauseStatuses: ["IT", "I"] },
} as const;
