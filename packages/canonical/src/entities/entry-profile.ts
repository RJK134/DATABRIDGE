import { z } from "zod";

/**
 * EntryProfile — qualifications held by a student on entry. HESA
 * EntryProfile entity. Used for participation and widening-access analytics.
 */
export const EntryProfileZ = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  studentId: z.string().uuid(),
  /** Highest qualification on entry (HESA QUALENT3). */
  highestEntryQualification: z.string().optional(),
  /** UCAS tariff points on entry. */
  ucasTariffPoints: z.number().int().optional(),
  /** Previous institution attended (HESA UCASINST / TARIFF). */
  previousInstitution: z.string().optional(),
  /** Domicile at point of application. */
  domicileAtApplication: z.string().optional(),
  /** Disability declared at application. */
  disabilityAtApplication: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type EntryProfile = z.infer<typeof EntryProfileZ>;
