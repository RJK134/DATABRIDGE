import { z } from 'zod';

/**
 * SES — Socio-Economic Status (HESA Data Futures SES entity). Captures the
 * student's self-reported socio-economic background used for widening
 * participation reporting. One SES record per Engagement.
 */
export const SesZ = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  /** Foreign key to canonical Engagement.id. */
  engagementId: z.string().uuid(),
  /** HESA SOC2020 — Standard Occupational Classification (4-digit). */
  soc2020: z.string().regex(/^\d{4}$/).optional(),
  /** HESA NSSEC — derived National Statistics Socio-economic Classification. */
  nssec: z.string().optional(),
  /** HESA PARED — highest qualification of parents. */
  parentalEducation: z.string().optional(),
  /** Self-reported school type (HESA SCHTYPE). */
  schoolType: z.string().optional(),
  /** Free-school-meal indicator if collected. */
  freeSchoolMeals: z.boolean().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type Ses = z.infer<typeof SesZ>;
