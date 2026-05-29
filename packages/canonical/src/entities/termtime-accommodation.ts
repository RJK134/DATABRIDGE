import { z } from "zod";

/**
 * TermtimeAccommodation — where the student lives during term-time (HESA
 * Data Futures TermtimeAccommodation entity). Required for F03-09. One row
 * per Instance; address fields are PII.
 */
export const TermtimeAccommodationZ = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  /** Foreign key to canonical Instance.id. */
  instanceId: z.string().uuid(),
  /** HESA TTACCOM — coded category of term-time accommodation. */
  accommodationType: z.string(),
  /** Postcode (PII — redact in logs). */
  postcode: z.string().optional(),
  /** Country (ISO 3166-1 alpha-2). */
  countryCode: z.string().length(2).optional(),
  /** HESA TTPCDUR — proportion of term-time spent at this accommodation. */
  proportionPct: z.number().min(0).max(100).optional(),
  /** Effective from / to. */
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type TermtimeAccommodation = z.infer<typeof TermtimeAccommodationZ>;
