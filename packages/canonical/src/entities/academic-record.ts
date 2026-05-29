import { z } from "zod";
import { ProvenanceFieldsZ } from "./provenance.js";

/**
 * Hold — an account hold preventing service (registration, transcript, etc.).
 * Banner: SPRHOLD. SITS: ins_sho / scj holds.
 */
export const HoldZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    holdType: z.string(),
    reason: z.string().optional(),
    appliedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    releasedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    appliedBy: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type Hold = z.infer<typeof HoldZ>;

/**
 * Advisor — staff member assigned as advisor/tutor to a student.
 * Banner: SGRADVR. SITS: INS_STU.stu_supr / supervision allocation.
 */
export const AdvisorZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    /** Source identifier for the advising staff member. */
    advisorSourceId: z.string(),
    advisorName: z.string().optional(),
    advisorEmail: z.string().email().optional(),
    role: z.string().optional(),
    primaryAdvisor: z.boolean().optional(),
    fromDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    toDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type Advisor = z.infer<typeof AdvisorZ>;

/**
 * TransferCredit — credit accepted from a prior institution.
 * Banner: SHRTRCE / SHRTRAM. SITS: INS_TCR.
 */
export const TransferCreditZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    sourceInstitution: z.string(),
    moduleCode: z.string().optional(),
    moduleTitle: z.string().optional(),
    creditsAwarded: z.number(),
    creditUnit: z.string().optional(),
    grade: z.string().optional(),
    awardedFor: z.string().uuid().optional(),
    awardedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type TransferCredit = z.infer<typeof TransferCreditZ>;

/**
 * RecognisedPriorLearning — APL/RPL credit recognition.
 * Distinct from TransferCredit: this is credit granted for prior
 * non-formal/experiential learning, not credit moved from another HEI.
 */
export const RecognisedPriorLearningZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    programmeEnrolmentId: z.string().uuid().optional(),
    creditsAwarded: z.number(),
    creditUnit: z.string().optional(),
    rplType: z.string().optional(),
    evidenceRef: z.string().optional(),
    grantedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    grantedBy: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type RecognisedPriorLearning = z.infer<typeof RecognisedPriorLearningZ>;

/**
 * TermGPA — per-term GPA snapshot (Banner SHRTGPA). UK SITS doesn't carry
 * this natively; the entity is mostly Banner-populated.
 */
export const TermGPAZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    /** Term code or canonical academic-year string. */
    period: z.string(),
    gpa: z.number(),
    creditsAttempted: z.number().optional(),
    creditsEarned: z.number().optional(),
    qualityPoints: z.number().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type TermGPA = z.infer<typeof TermGPAZ>;

/**
 * TestScore — standardised test result (SAT, IELTS, GMAT, etc.).
 * Banner: SORTEST. SITS: INS_TST.
 */
export const TestScoreZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    testCode: z.string(),
    score: z.string(),
    takenAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    expiresAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type TestScore = z.infer<typeof TestScoreZ>;

/**
 * StatutoryReturn — a record of a submission to a statutory body
 * (HESA, UKVI, OfS, DfE). The canonical representation of an audit-trail
 * row, not the submitted payload itself.
 */
export const StatutoryReturnZ = z
  .object({
    id: z.string().uuid(),
    body: z.string(),
    collection: z.string(),
    collectionYear: z
      .string()
      .regex(/^\d{4}\/\d{2}$/)
      .optional(),
    submittedAt: z.string().datetime(),
    submittedBy: z.string().optional(),
    status: z.string().optional(),
    recordsSubmitted: z.number().int().nonnegative().optional(),
    /** Reference id from the receiving body if known. */
    externalRef: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type StatutoryReturn = z.infer<typeof StatutoryReturnZ>;
