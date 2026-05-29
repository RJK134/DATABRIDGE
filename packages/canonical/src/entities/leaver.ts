import { z } from "zod";

/**
 * Leaver — a student who has left the institution. HESA Leaver entity:
 * captures the exit details, qualifications awarded, and reason for ending.
 */
export const LeaverZ = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  engagementId: z.string().uuid(),
  /** Date of leaving (YYYY-MM-DD). */
  leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Reason for ending (HESA RSNEND). */
  reasonForEnding: z.string(),
  /** Qualification awarded on leaving (HESA QUAL). */
  qualificationAwarded: z.string().optional(),
  /** Classification (e.g. "FIRST", "21", "PASS"). */
  classification: z.string().optional(),
  /** HESA destination of leavers code. */
  destination: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type Leaver = z.infer<typeof LeaverZ>;
