import { z } from 'zod';
import { ProvenanceFieldsZ } from './provenance.js';

/**
 * StudentCourseSession — a single academic-year instance of a student's
 * engagement on a course. HESA Data Futures core entity.
 *
 * Phase G: carries provenance fields so source-side effective-dating
 * (Banner SGBSTDN.TERM_CODE_EFF, SITS sce_stac + sce_ayrc) can be
 * preserved uniformly via `effectiveDating`.
 */
export const StudentCourseSessionZ = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  engagementId: z.string().uuid(),
  /** Academic year, e.g. "2024/25". */
  academicYear: z.string().regex(/^\d{4}\/\d{2}$/),
  /** Commencement date (YYYY-MM-DD). */
  commencementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** End date (YYYY-MM-DD). */
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Mode of study (HESA MODE). */
  mode: z.string(),
  /** Student load — fraction of full-time, 0.0–1.0. */
  studentLoad: z.number().min(0).max(1).optional(),
  /** Completion of funding (HESA FUNDCOMP). */
  fundComp: z.string().optional(),
  /** Year of programme (1, 2, 3...). */
  yearOfProgramme: z.number().int().min(0).optional(),
  /** Location of study (HESA LOCSDY). */
  locationOfStudy: z.string().optional(),
  /** Gross fee for the session. */
  grossFee: z.number().optional(),
  /** Net fee after waivers/discounts. */
  netFee: z.number().optional(),
  attributes: z.record(z.unknown()).optional(),
}).merge(ProvenanceFieldsZ);

export type StudentCourseSession = z.infer<typeof StudentCourseSessionZ>;
