import { z } from "zod";

export const SitsToBannerConfigSchema = z.object({
  source: z.enum(["sits-api", "sits-file"]),
  batchSize: z.number().int().min(1).max(10_000).default(500),
  dryRun: z.boolean().default(true),
  entities: z
    .array(z.enum(["Student", "Programme", "Enrolment", "TermGpa", "CourseRegistration", "Award"]))
    .default([]),
  collectionYear: z.string().regex(/^\d{4}\/\d{2}$/),
  tenantId: z.string().optional(),
});

export type SitsToBannerConfig = z.infer<typeof SitsToBannerConfigSchema>;
