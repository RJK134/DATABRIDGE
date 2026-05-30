import { z } from "zod";

/**
 * Engagement — a student's enrolment with the institution for a defined
 * period (HESA Data Futures terminology). One Student can have many
 * Engagements over time; each Engagement contains 0..n StudentCourseSession
 * records.
 */
export const EngagementZ = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  /** Foreign key to canonical Student.id. */
  studentId: z.string().uuid(),
  /** HUSID at time of engagement (may differ if reissued). */
  husid: z
    .string()
    .regex(/^\d{13}$/)
    .optional(),
  /** UK Provider Reference Number (HESA UKPRN). */
  ukprn: z.string(),
  /** Engagement start date (YYYY-MM-DD). */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Engagement end date (YYYY-MM-DD), if ended. */
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** HESA RSNEND — reason for ending. */
  reasonForEnding: z.string().optional(),
  /** Mode of study at engagement level (HESA MODE). */
  mode: z.string().optional(),
  /** HESA COURSEID — primary course associated with the engagement. */
  courseId: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type Engagement = z.infer<typeof EngagementZ>;
