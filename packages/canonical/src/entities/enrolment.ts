import { z } from 'zod';
import { ProvenanceFieldsZ } from './provenance.js';

/**
 * ModuleEnrolment — one student registered on one module instance.
 * Banner: SFRSTCR. SITS: INS_SMO.
 */
export const ModuleEnrolmentZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    moduleInstanceId: z.string().uuid(),
    /** REGISTERED | WITHDRAWN | DROPPED | COMPLETED_PASS | COMPLETED_FAIL | DEFERRED. */
    status: z.string(),
    /** Credits attempted in the source unit (Banner credit hours or SITS CATS). */
    creditsAttempted: z.number().optional(),
    /** Source credit-unit declaration: "credit-hour" | "cats" | "ects" | "other". */
    creditUnit: z.string().optional(),
    /** Registration date (YYYY-MM-DD). */
    registeredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** Grading mode (Banner GMOD_CODE). */
    gradingMode: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type ModuleEnrolment = z.infer<typeof ModuleEnrolmentZ>;

/**
 * ModuleResult — the final outcome of a ModuleEnrolment.
 * Banner: SHRTCKG (final-grade row). SITS: INS_SMR.
 */
export const ModuleResultZ = z
  .object({
    id: z.string().uuid(),
    moduleEnrolmentId: z.string().uuid(),
    /** Numeric mark (0–100 typical UK). Optional when scheme is purely letter. */
    finalMark: z.number().min(0).max(100).optional(),
    /** Display grade as recorded (e.g. "B+", "Pass", "68"). */
    gradeDisplay: z.string().optional(),
    /** Pass / fail determination at module level. */
    pass: z.boolean().optional(),
    /** Credits awarded (may differ from attempted on fail). */
    creditsAwarded: z.number().optional(),
    /** When the grade was finalised (YYYY-MM-DD). */
    gradedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** Attempt / retake sequence — 1 = first sit, 2 = first resit, etc. */
    attemptNumber: z.number().int().min(1).optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type ModuleResult = z.infer<typeof ModuleResultZ>;

/**
 * AssessmentResult — component-level result within a ModuleEnrolment.
 * SITS keeps these in MAB / SAT / SRA; Banner *does not* expose them as
 * a first-class concept — so this entity is sometimes empty for Banner
 * sources. The crosswalk §15.5 discusses the loss-of-information risk
 * during migration.
 */
export const AssessmentResultZ = z
  .object({
    id: z.string().uuid(),
    moduleEnrolmentId: z.string().uuid(),
    /** Component code (SITS MAB / SAT seq). */
    componentCode: z.string(),
    /** Component title / description. */
    title: z.string().optional(),
    /** Weighting within the module, 0.0–1.0. */
    weight: z.number().min(0).max(1).optional(),
    mark: z.number().min(0).max(100).optional(),
    gradeDisplay: z.string().optional(),
    pass: z.boolean().optional(),
    /** TRUE if this row is a reassessment (resit) record. */
    isReassessment: z.boolean().optional(),
    gradedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type AssessmentResult = z.infer<typeof AssessmentResultZ>;
