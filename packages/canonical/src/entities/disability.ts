import { z } from "zod";

/**
 * Disability — record of a student's declared disability (HESA Data Futures
 * Disability entity). Multiple Disability rows per Student are permitted
 * (one per declared disability code). Used by F03-06 and F11 rules.
 */
export const DisabilityZ = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  /** Foreign key to canonical Student.id. */
  studentId: z.string().uuid(),
  /** HESA DISABLE code (00 = no known disability, 51..58 = specific types). */
  disableCode: z.string(),
  /** Date the disability was declared. */
  declaredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** HESA DISALL — allowance received indicator. */
  allowanceReceived: z.boolean().optional(),
  /** Free-text accommodation description (PII — redact in logs). */
  accommodationNotes: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type Disability = z.infer<typeof DisabilityZ>;
