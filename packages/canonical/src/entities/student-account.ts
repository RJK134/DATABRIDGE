import { z } from "zod";
import { ProvenanceFieldsZ } from "./provenance.js";

/**
 * StudentAccount — the AR ledger header for a student.
 * Banner: TBBCUST + aggregated TBRACCD view. SITS: INS_SAS / INS_FIN.
 */
export const StudentAccountZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    /** Currency code, ISO 4217. */
    currency: z.string().length(3).default("GBP"),
    /** Outstanding balance, positive = owed by student. */
    balance: z.number(),
    /** Date balance was last computed (YYYY-MM-DD). */
    balanceAsOf: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type StudentAccount = z.infer<typeof StudentAccountZ>;

/** Charge — a single charge line. Banner TBRACCD with TRAN_TYPE=charge. */
export const ChargeZ = z
  .object({
    id: z.string().uuid(),
    studentAccountId: z.string().uuid(),
    detailCode: z.string(),
    description: z.string().optional(),
    amount: z.number(),
    /** Academic year the charge is associated with. */
    academicYear: z
      .string()
      .regex(/^\d{4}\/\d{2}$/)
      .optional(),
    /** Effective / charge date (YYYY-MM-DD). */
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type Charge = z.infer<typeof ChargeZ>;

/** Payment — a single payment line. Banner TBRACCD with TRAN_TYPE=payment. */
export const PaymentZ = z
  .object({
    id: z.string().uuid(),
    studentAccountId: z.string().uuid(),
    detailCode: z.string(),
    description: z.string().optional(),
    /** Positive number; direction is implied by Payment vs Charge. */
    amount: z.number().min(0),
    receivedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    method: z.string().optional(),
    sponsorId: z.string().uuid().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type Payment = z.infer<typeof PaymentZ>;

/** Sponsor — an external party paying for a student. */
export const SponsorZ = z
  .object({
    id: z.string().uuid(),
    /** Display name of the sponsoring organisation. */
    name: z.string(),
    /** External identifier, e.g. Banner SPRIDEN PIDM for org records. */
    sourceId: z.string().optional(),
    sponsorType: z.string().optional(),
    contactEmail: z.string().email().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type Sponsor = z.infer<typeof SponsorZ>;
