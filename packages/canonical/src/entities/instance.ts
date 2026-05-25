import { z } from 'zod';

/**
 * Instance — a discrete instance of a student's study within an Engagement
 * (HESA Data Futures Instance entity). Captures the year-by-year activity
 * level. One Engagement contains 1..n Instances (typically one per academic
 * reporting year).
 */
export const InstanceZ = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  /** Foreign key to canonical Engagement.id. */
  engagementId: z.string().uuid(),
  /** Academic year (HESA convention, e.g. "2024/25"). */
  academicYear: z.string().regex(/^\d{4}\/\d{2}$/),
  /** HESA MODE — student's mode of study for this instance. */
  mode: z.string().optional(),
  /** HESA STULOAD — proportion of full-time equivalent (0..100). */
  stuload: z.number().min(0).max(100).optional(),
  /** HESA TYPEYR — year of programme. */
  typeYear: z.string().optional(),
  /** HESA YEARPRG — current year of programme. */
  yearOfProgramme: z.number().int().positive().optional(),
  /** HESA COURSEAIM at instance level. */
  courseAim: z.string().optional(),
  /** HESA FUNDCOMP — funding completion status. */
  fundComp: z.string().optional(),
  /** HESA REGBODY — registering professional body. */
  regBody: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type Instance = z.infer<typeof InstanceZ>;
