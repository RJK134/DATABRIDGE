import { z } from "zod";
import { ProvenanceFieldsZ } from "./provenance.js";

/**
 * Address — a postal address, typed by usage (home / term-time / corresp.).
 * Banner: SPRADDR rows keyed by ATYP_CODE. SITS: INS_ADD rows keyed by add_atyp.
 */
export const AddressTypeZ = z.enum([
  "home",
  "term-time",
  "correspondence",
  "employer",
  "billing",
  "permanent",
  "previous",
  "other",
]);
export type AddressType = z.infer<typeof AddressTypeZ>;

export const AddressZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    type: AddressTypeZ,
    line1: z.string(),
    line2: z.string().optional(),
    line3: z.string().optional(),
    city: z.string().optional(),
    region: z.string().optional(),
    postcode: z.string().optional(),
    /** ISO 3166-1 alpha-3 or HESA legacy code. */
    country: z.string().optional(),
    /** True if this is the person's preferred address of this type. */
    preferred: z.boolean().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type Address = z.infer<typeof AddressZ>;

/** EmailAddress — Banner GOREMAL, SITS stu_email / ins_eml. */
export const EmailAddressZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    address: z.string().email(),
    /** Usage code (CAMP, HOME, WORK, etc.). */
    usage: z.string().optional(),
    preferred: z.boolean().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type EmailAddress = z.infer<typeof EmailAddressZ>;

/** Phone — Banner SPRTELE, SITS ins_tel. */
export const PhoneZ = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    number: z.string(),
    /** Usage code (MOBL, HOME, WORK, etc.). */
    usage: z.string().optional(),
    preferred: z.boolean().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .merge(ProvenanceFieldsZ);
export type Phone = z.infer<typeof PhoneZ>;
