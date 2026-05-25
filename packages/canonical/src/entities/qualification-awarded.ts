import { z } from 'zod';

/**
 * QualificationAwarded — a qualification conferred on a student at the
 * conclusion of an Instance (HESA Data Futures QualificationAwarded entity).
 * One row per qualification awarded; multiple permitted per Engagement when
 * exit awards apply. Required for F03-07.
 */
export const QualificationAwardedZ = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  /** Foreign key to canonical Instance.id. */
  instanceId: z.string().uuid(),
  /** HESA QUAL — qualification code (e.g. H, I, J, L, M for HE levels). */
  qualCode: z.string(),
  /** HESA CLASS — class of award (e.g. 01 = first class). */
  classOfAward: z.string().optional(),
  /** Date the qualification was awarded. */
  awardDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** HESA HECoS — primary subject of award. */
  primarySubject: z.string().optional(),
  /** Awarding body UKPRN (may differ from delivery institution). */
  awardingBodyUkprn: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type QualificationAwarded = z.infer<typeof QualificationAwardedZ>;
