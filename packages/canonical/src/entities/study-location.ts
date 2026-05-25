import { z } from 'zod';

/**
 * StudyLocation — physical or virtual location where the student studies for
 * a given Instance (HESA Data Futures StudyLocation entity). Required for
 * F03-04 of the audit catalogue. Multiple StudyLocation rows per Instance are
 * permitted where activity is split across sites.
 */
export const StudyLocationZ = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  /** Foreign key to canonical Instance.id. */
  instanceId: z.string().uuid(),
  /** HESA LOCSDY — code for the location where the activity is delivered. */
  locsdy: z.string(),
  /** HESA PCSLDCS — proportion (percent) of activity at this location. */
  proportionPct: z.number().min(0).max(100),
  /** Country (ISO 3166-1 alpha-2) where this location sits. */
  countryCode: z.string().length(2).optional(),
  /** Partner-provider UKPRN, when the location is a franchise/collaborative. */
  partnerUkprn: z.string().optional(),
  /** Effective period of this location assignment. */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type StudyLocation = z.infer<typeof StudyLocationZ>;
