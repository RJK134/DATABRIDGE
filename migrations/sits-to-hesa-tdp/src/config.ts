import { z } from "zod";

/**
 * Configuration for the SITS -> HESA TDP migration orchestrator.
 *
 * The pipeline is:
 *   SITS adapter (api OR file) -> @databridge/canonical entities -> HESA TDP profile validation
 *
 * Each canonical entity is fetched via the configured SITS adapter, mapped to
 * the canonical shape, then validated against HESA TDP rules before being
 * staged for write into the target system.
 */
export const SitsToHesaTdpConfigSchema = z.object({
  /** Which SITS adapter to use as the upstream source. */
  source: z.enum(["sits-api", "sits-file"]),
  /** Batch size used when streaming canonical entities through validation. */
  batchSize: z.number().int().min(1).max(10_000).default(500),
  /** When true, the orchestrator only validates; nothing is committed downstream. */
  dryRun: z.boolean().default(true),
  /** Canonical entities to include in this run. Empty = all. */
  entities: z
    .array(z.enum(["Student", "Engagement", "Module", "Leaver", "EntryProfile"]))
    .default([]),
  /** Target collection year, e.g. "2024/25". */
  collectionYear: z.string().regex(/^\d{4}\/\d{2}$/),
});

export type SitsToHesaTdpConfig = z.infer<typeof SitsToHesaTdpConfigSchema>;
