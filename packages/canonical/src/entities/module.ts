import { z } from "zod";
import { ProvenanceFieldsZ } from "./provenance.js";

/**
 * Module — a unit of teaching that students can take. Equivalent to
 * HESA Module entity, SITS MOD, Banner SCBCRSE.
 */
export const ModuleZ = z
  .object({
    id: z.string().uuid(),
    sourceId: z.string(),
    /** Module code (e.g. "CS101"). */
    code: z.string(),
    title: z.string(),
    /** Credit value (HESA CRDTSCM). */
    credits: z.number().optional(),
    /** Level of study (HESA LEVELMOD). */
    level: z.string().optional(),
    /** HECoS subject code (6 digits). */
    hecosCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    /** Module owner department or school. */
    ownerDepartment: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);

export type Module = z.infer<typeof ModuleZ>;

/**
 * ModuleInstance — a specific occurrence (delivery) of a Module within an
 * academic year. HESA: StudentModuleInstance for the student-linked variant.
 */
export const ModuleInstanceZ = z
  .object({
    id: z.string().uuid(),
    sourceId: z.string(),
    moduleId: z.string().uuid(),
    academicYear: z.string().regex(/^\d{4}\/\d{2}$/),
    /** Start date of the instance (YYYY-MM-DD). */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** End date of the instance (YYYY-MM-DD). */
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** Outcome of the instance for a student (HESA MODOUTCOME). */
    outcome: z.string().optional(),
    /** Final grade or mark. */
    grade: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);

export type ModuleInstance = z.infer<typeof ModuleInstanceZ>;
