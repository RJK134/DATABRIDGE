import { z } from 'zod';
import { ProvenanceFieldsZ } from './provenance.js';

/**
 * Student — the canonical, source-agnostic representation of a student
 * record in DATABRIDGE. Derived from the UCISA HERM (Higher Education
 * Reference Model) Student entity and harmonised with HESA Data Futures
 * requirements.
 *
 * Adapters MAP from their native shape (SITS STU, Banner SPRIDEN, Workday
 * Student, etc.) INTO this canonical shape; profile packs map FROM this
 * shape into their target shape.
 *
 * Phase G: carries provenance (altIds / sourceKeys / effectiveDating) so
 * the same human appearing in Banner (as a PIDM) and SITS (as a mst_code)
 * resolves to one canonical record without collapsing identity.
 */
export const StudentZ = z.object({
  /** Stable canonical id (UUID assigned by DATABRIDGE on first ingest). */
  id: z.string().uuid(),
  /** Source system identifier (e.g. SITS STU_CODE, Banner SPRIDEN_ID). */
  sourceId: z.string(),
  /** HESA Unique Student Identifier when known. */
  husid: z.string().regex(/^\d{13}$/).optional(),
  /** Personal name parts. */
  firstName: z.string(),
  lastName: z.string(),
  middleNames: z.string().optional(),
  preferredName: z.string().optional(),
  /** Date of birth (YYYY-MM-DD). */
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** HESA SEXID — gender identity code. */
  genderId: z.string().optional(),
  /** HESA ETHNIC — ethnicity code. */
  ethnicity: z.string().optional(),
  /** HESA DISABLE — disability code. Comma-separated when multi-valued. */
  disability: z.string().optional(),
  /** HESA NATION — nationality (ISO 3166-1 numeric or HESA legacy code). */
  nationality: z.string().optional(),
  /** HESA DOMICILE — domicile country code. */
  domicile: z.string().optional(),
  /** Contact: primary email. */
  email: z.string().email().optional(),
  /** Contact: primary phone. */
  phone: z.string().optional(),
  /** Provider's own student identifier (HESA OWNSTU). */
  ownStuId: z.string().optional(),
  /** Free-form notes / tenant extension fields. */
  attributes: z.record(z.unknown()).optional(),
}).merge(ProvenanceFieldsZ);

export type Student = z.infer<typeof StudentZ>;
