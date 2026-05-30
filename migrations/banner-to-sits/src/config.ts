import { z } from "zod";

/**
 * Configuration for the Banner → SITS migration orchestrator.
 *
 * Pipeline: Banner adapter → @databridge/canonical entities → SITS load
 * plan. The orchestrator validates and emits per-entity outcomes plus a
 * structured load plan. It does NOT execute SITS writes.
 */
export const BannerToSitsConfigSchema = z.object({
  /** Which Banner adapter to use as the upstream source. */
  source: z.enum(["banner-oracle", "banner-ethos"]),
  /** Batch size used when streaming canonical entities through validation. */
  batchSize: z.number().int().min(1).max(10_000).default(500),
  /** When true, the orchestrator only validates; no load plan is materialised. */
  dryRun: z.boolean().default(true),
  /** Canonical entities to include in this run. Empty = all. */
  entities: z
    .array(z.enum(["Student", "Programme", "Enrolment", "TermGpa", "CourseRegistration", "Award"]))
    .default([]),
  /** Target collection year in SITS-style YYYY/YY. */
  collectionYear: z.string().regex(/^\d{4}\/\d{2}$/),
  /** Tenant id used to resolve codeset overrides; defaults to bundled defaults. */
  tenantId: z.string().optional(),
});

export type BannerToSitsConfig = z.infer<typeof BannerToSitsConfigSchema>;
