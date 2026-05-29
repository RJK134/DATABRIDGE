import { z } from "zod";
import { ProvenanceFieldsZ } from "./provenance.js";

/**
 * Programme — the named award-bearing course of study (e.g. "BSc Computer
 * Science"). HERM Programme. SITS CAM_CRS / route; Banner programme code.
 */
export const ProgrammeZ = z
  .object({
    id: z.string().uuid(),
    sourceId: z.string(),
    /** Programme code (e.g. "BSC-CS", "CRS123"). */
    code: z.string(),
    title: z.string(),
    /** UG / PGT / PGR / FE / OTHER. */
    level: z.string().optional(),
    /** Award code (HESA QUALAIM target, e.g. "BSC", "MSC"). */
    awardCode: z.string().optional(),
    /** Department / school owning the programme. */
    owningDepartment: z.string().optional(),
    /** HECoS subject code (6 digits) of primary subject. */
    primaryHecos: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type Programme = z.infer<typeof ProgrammeZ>;

/**
 * ProgrammeEnrolment — a person's enrolment on a programme as a whole
 * (cross-year). Banner: SGBSTDN spine. SITS: INS_SCJ.
 */
export const ProgrammeEnrolmentZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    programmeId: z.string().uuid(),
    /** Enrolment start date (YYYY-MM-DD). */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Enrolment end date (YYYY-MM-DD), if completed/withdrawn. */
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** ACTIVE | WITHDRAWN | TRANSFERRED | INTERCALATING | COMPLETED | DORMANT. */
    status: z.string(),
    /** FULL_TIME | PART_TIME | SANDWICH | DL | OTHER. */
    mode: z.string().optional(),
    /** Attempt sequence — SITS scj_code suffix "/N", Banner SGBSTDN seq. */
    attemptNumber: z.number().int().min(1).optional(),
    /** Award targeted (may differ from programme.awardCode for transfers). */
    targetAwardCode: z.string().optional(),
    /** Highest qualification on entry (HESA scj_hiqp / QUALENT3). */
    highestQualOnEntry: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type ProgrammeEnrolment = z.infer<typeof ProgrammeEnrolmentZ>;

/**
 * AcademicYearEnrolment — one academic year of a ProgrammeEnrolment.
 * Banner: SFBETRM per term, rolled into AY. SITS: INS_SCE.
 */
export const AcademicYearEnrolmentZ = z
  .object({
    id: z.string().uuid(),
    programmeEnrolmentId: z.string().uuid(),
    /** Academic year, e.g. "2024/25". */
    academicYear: z.string().regex(/^\d{4}\/\d{2}$/),
    yearOfStudy: z.number().int().min(0),
    /** REGISTERED | WITHDRAWN | INTERCALATING | COMPLETED | NON_FINALIST | OTHER. */
    status: z.string(),
    mode: z.string().optional(),
    /** HESA-style block / period identifier (SITS sce_blok). */
    block: z.string().optional(),
    feeStatus: z.string().optional(),
    /** STVRESD / SITS sce_fees. */
    residencyForFees: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type AcademicYearEnrolment = z.infer<typeof AcademicYearEnrolmentZ>;
