/**
 * Banner programme/student/registration mapping.
 *
 * The bidirectional Banner↔SITS migrations need a CASE-style mapping from
 * Banner-side identity + programme + registration rows to a canonical
 * { studentId, programmeCode, termCode, campusCode, residency } projection
 * (and back). This module declares the mapping as a static structure so
 * it can be inspected by tests + the parallel-run verifier without any
 * runtime SQL.
 */
import type { BannerEntityKey } from "../entities/index.js";

export interface BannerToCanonicalMap {
  /** Canonical field as understood by @databridge/canonical. */
  canonicalField: string;
  /** Banner table the value is sourced from. */
  bannerTable: string;
  /** Banner column the value is sourced from. */
  bannerColumn: string;
  /** When true, the Banner column should be folded through a codeset lookup. */
  needsCodesetMap?: boolean;
  /** Optional CASE-style transform expression in pseudo-SQL form. */
  caseRule?: string;
}

/**
 * Canonical "ProgrammeRegistration" projection — the surface the migration
 * runner uses when round-tripping Banner ⇄ SITS.
 */
export const BANNER_PROGRAMME_REGISTRATION_MAP: BannerToCanonicalMap[] = [
  {
    canonicalField: "personId",
    bannerTable: "SPRIDEN",
    bannerColumn: "SPRIDEN_PIDM",
  },
  {
    canonicalField: "institutionalId",
    bannerTable: "SPRIDEN",
    bannerColumn: "SPRIDEN_ID",
  },
  {
    canonicalField: "lastName",
    bannerTable: "SPRIDEN",
    bannerColumn: "SPRIDEN_LAST_NAME",
  },
  {
    canonicalField: "firstName",
    bannerTable: "SPRIDEN",
    bannerColumn: "SPRIDEN_FIRST_NAME",
  },
  {
    canonicalField: "dateOfBirth",
    bannerTable: "SPRIDEN",
    bannerColumn: "SPRIDEN_BIRTH_DATE",
  },
  {
    canonicalField: "programmeCode",
    bannerTable: "SGBSTDN",
    bannerColumn: "SGBSTDN_MAJR_CODE_1",
    needsCodesetMap: true,
    caseRule:
      "CASE WHEN SGBSTDN_MAJR_CODE_1 IS NOT NULL THEN SGBSTDN_MAJR_CODE_1 ELSE COALESCE(SORLFOS_MAJR_CODE, '__UNDECLARED__') END",
  },
  {
    canonicalField: "termCode",
    bannerTable: "SGBSTDN",
    bannerColumn: "SGBSTDN_TERM_CODE_EFF",
    needsCodesetMap: true,
  },
  {
    canonicalField: "campusCode",
    bannerTable: "SGBSTDN",
    bannerColumn: "SGBSTDN_CAMP_CODE",
    needsCodesetMap: true,
  },
  {
    canonicalField: "studentType",
    bannerTable: "SGBSTDN",
    bannerColumn: "SGBSTDN_STYP_CODE",
    needsCodesetMap: true,
    caseRule:
      "CASE WHEN SGBSTDN_STYP_CODE IN ('F','C') THEN 'first-time' WHEN SGBSTDN_STYP_CODE = 'R' THEN 'returning' ELSE 'other' END",
  },
  {
    canonicalField: "feeStatus",
    bannerTable: "SGBSTDN",
    bannerColumn: "SGBSTDN_RESD_CODE",
    needsCodesetMap: true,
  },
];

/**
 * Resolve the Banner entity key (e.g. `Sgbstdn`) used for a given canonical
 * field. Returns undefined if the field is not part of the programme/
 * registration projection.
 */
export function canonicalToBannerEntity(canonicalField: string): BannerEntityKey | undefined {
  const tableToEntity: Record<string, BannerEntityKey> = {
    SPRIDEN: "Spriden",
    SGBSTDN: "Sgbstdn",
    SORLCUR: "Sorlcur",
    SORLFOS: "Sorlfos",
    SHRTGPA: "Shrtgpa",
    SHRDGMR: "Shrdgmr",
  };
  const m = BANNER_PROGRAMME_REGISTRATION_MAP.find((e) => e.canonicalField === canonicalField);
  if (!m) return undefined;
  return tableToEntity[m.bannerTable];
}

/**
 * Inverse: given a Banner table+column tuple, return the canonical field
 * it maps to.
 */
export function bannerEntityToCanonical(table: string, column: string): string | undefined {
  const m = BANNER_PROGRAMME_REGISTRATION_MAP.find(
    (e) => e.bannerTable === table && e.bannerColumn === column
  );
  return m?.canonicalField;
}
