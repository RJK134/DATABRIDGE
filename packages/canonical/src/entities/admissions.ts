import { z } from "zod";
import { ProvenanceFieldsZ } from "./provenance.js";

/**
 * Application — a person's application to a programme.
 * Banner: SARADAP. SITS: CAM_CAP / CAM_APP.
 */
export const ApplicationZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    /** Programme applied for. */
    programmeId: z.string().uuid(),
    /** Application sequence number (Banner APPL_NO, SITS cap_seqn). */
    applicationNumber: z.number().int().min(1),
    /** Targeted entry term / academic year. */
    entryAcademicYear: z.string().regex(/^\d{4}\/\d{2}$/),
    /** Submission date (YYYY-MM-DD). */
    submittedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** Banner APST_CODE / SITS cap_apst — application processing status. */
    status: z.string().optional(),
    /** Source channel (UCAS, direct, agent). */
    channel: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type Application = z.infer<typeof ApplicationZ>;

/**
 * ApplicationDecision — outcome row attached to an Application.
 * Banner: SARADAP.APDC_CODE + decision dates. SITS: CAM_CAP decision fields.
 */
export const ApplicationDecisionZ = z
  .object({
    id: z.string().uuid(),
    applicationId: z.string().uuid(),
    /** AW (awarded/offered) | WL (waitlist) | RJ (rejected) | WD (withdrawn) | OTHER. */
    decisionCode: z.string(),
    decisionAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Conditions text if conditional. */
    conditions: z.string().optional(),
    /** Date offer accepted by applicant, if any. */
    acceptedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type ApplicationDecision = z.infer<typeof ApplicationDecisionZ>;

/**
 * VisaRecord — typed sub-entity covering both UK CAS and US SEVIS regimes.
 * Crosswalk §15.8 — migration in either direction requires explicit
 * compliance mapping.
 */
const VisaBaseZ = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  /** Visa issue date (YYYY-MM-DD). */
  issuedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Visa expiry date (YYYY-MM-DD). */
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Issuing-country code. */
  issuingCountry: z.string().optional(),
  status: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export const CasVisaZ = VisaBaseZ.extend({
  kind: z.literal("CAS"),
  /** UK Confirmation of Acceptance for Studies number. */
  casNumber: z.string(),
  /** CAS reference for the sponsoring institution. */
  sponsorLicenceNumber: z.string().optional(),
}).merge(ProvenanceFieldsZ);
export type CasVisa = z.infer<typeof CasVisaZ>;

export const SevisVisaZ = VisaBaseZ.extend({
  kind: z.literal("SEVIS"),
  /** US SEVIS number from Banner GORVISA.SEVIS_NUMBER. */
  sevisNumber: z.string(),
  /** US visa type code (F-1, J-1, M-1). */
  visaType: z.string().optional(),
}).merge(ProvenanceFieldsZ);
export type SevisVisa = z.infer<typeof SevisVisaZ>;

/** Discriminated union — every VisaRecord is either a CAS or a SEVIS row. */
export const VisaRecordZ = z.discriminatedUnion("kind", [CasVisaZ, SevisVisaZ]);
export type VisaRecord = z.infer<typeof VisaRecordZ>;
