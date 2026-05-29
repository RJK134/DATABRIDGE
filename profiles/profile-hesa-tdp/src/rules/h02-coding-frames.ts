import type { RuleDefinition } from "@databridge/rule-core";
import {
  VALID_ETHNIC_CODES,
  VALID_DISABLE_CODES,
  VALID_DOMICILE_CODES,
  VALID_MODE_CODES,
  VALID_RSNEND_CODES,
  VALID_QUALENT3_CODES,
  VALID_FUNDCOMP_CODES,
  VALID_SEXID_CODES,
  UK_DOMICILE_CODES,
} from "../codings";

/**
 * H02 — Coding frame conformance rules.
 * All coded fields must contain values from the official HESA coding frames.
 */

export const H02_RULES: RuleDefinition[] = [
  {
    id: "H02-001",
    family: "H02",
    entity: "Student",
    field: "ethnicity",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-STU-ETHNIC",
    description: "ETHNIC must be a valid HESA ETHNIC coding frame value",
    evaluate: (record) => {
      const val = record["ethnicity"] as string;
      if (!val)
        return {
          pass: false,
          message: "ETHNIC is missing. Ethnicity is mandatory for all Student records.",
        };
      if (!VALID_ETHNIC_CODES.has(val)) {
        return { pass: false, message: `ETHNIC value "${val}" is not a valid HESA ETHNIC code.` };
      }
      return { pass: true };
    },
  },
  {
    id: "H02-002",
    family: "H02",
    entity: "Student",
    field: "disability",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-STU-DISABLE",
    description: "DISABLE must be a valid HESA DISABLE coding frame value",
    evaluate: (record) => {
      const val = record["disability"] as string;
      if (!val)
        return {
          pass: false,
          message: "DISABLE is missing. Disability is mandatory for all Student records.",
        };
      if (!VALID_DISABLE_CODES.has(val)) {
        return { pass: false, message: `DISABLE value "${val}" is not a valid HESA DISABLE code.` };
      }
      return { pass: true };
    },
  },
  {
    id: "H02-003",
    family: "H02",
    entity: "Student",
    field: "domicile",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-STU-DOMICILE",
    description: "DOMICILE must be a valid HESA DOMICILE coding frame value",
    evaluate: (record) => {
      const val = record["domicile"] as string;
      if (!val)
        return {
          pass: false,
          message: "DOMICILE is missing. Domicile is mandatory for all Student records.",
        };
      if (!VALID_DOMICILE_CODES.has(val)) {
        return {
          pass: false,
          message: `DOMICILE value "${val}" is not a valid HESA DOMICILE code.`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H02-004",
    family: "H02",
    entity: "StudentCourseSession",
    field: "modeOfStudy",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-SCS-MODE",
    description: "MODE must be a valid HESA MODE coding frame value",
    evaluate: (record) => {
      const val = record["modeOfStudy"] as string;
      if (!val) return { pass: false, message: "MODE (modeOfStudy) is missing." };
      if (!VALID_MODE_CODES.has(val)) {
        return { pass: false, message: `MODE value "${val}" is not a valid HESA MODE code.` };
      }
      return { pass: true };
    },
  },
  {
    id: "H02-005",
    family: "H02",
    entity: "Engagement",
    field: "reasonForEnding",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-ENG-RSNEND",
    description: "RSNEND, when provided, must be a valid HESA RSNEND coding frame value",
    evaluate: (record) => {
      const val = record["reasonForEnding"] as string | undefined;
      if (!val) return { pass: true }; // Optional field
      if (!VALID_RSNEND_CODES.has(val)) {
        return { pass: false, message: `RSNEND value "${val}" is not a valid HESA RSNEND code.` };
      }
      return { pass: true };
    },
  },
  {
    id: "H02-006",
    family: "H02",
    entity: "EntryProfile",
    field: "highestEntryQualification",
    severity: "WARNING",
    ucisa_benchmark_ref: "HESA-ENP-QUALENT3",
    description: "QUALENT3, when provided, must be a valid HESA QUALENT3 coding frame value",
    evaluate: (record) => {
      const val = record["highestEntryQualification"] as string | undefined;
      if (!val) return { pass: true };
      if (!VALID_QUALENT3_CODES.has(val)) {
        return {
          pass: false,
          message: `QUALENT3 value "${val}" is not a valid HESA QUALENT3 code.`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H02-007",
    family: "H02",
    entity: "StudentCourseSession",
    field: "completionOfFunding",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-SCS-FUNDCOMP",
    description: "FUNDCOMP must be a valid HESA FUNDCOMP coding frame value",
    evaluate: (record) => {
      const val = record["completionOfFunding"] as string;
      if (!val) return { pass: false, message: "FUNDCOMP (completionOfFunding) is missing." };
      if (!VALID_FUNDCOMP_CODES.has(val)) {
        return {
          pass: false,
          message: `FUNDCOMP value "${val}" is not a valid HESA FUNDCOMP code.`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H02-008",
    family: "H02",
    entity: "Student",
    field: "genderId",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-STU-SEXID",
    description: "SEXID must be a valid HESA SEXID coding frame value",
    evaluate: (record) => {
      const val = record["genderId"] as string;
      if (!val) return { pass: false, message: "SEXID (genderId) is missing." };
      if (!VALID_SEXID_CODES.has(val)) {
        return { pass: false, message: `SEXID value "${val}" is not a valid HESA SEXID code.` };
      }
      return { pass: true };
    },
  },
  {
    id: "H02-009",
    family: "H02",
    entity: "Student",
    field: "domicile",
    severity: "WARNING",
    ucisa_benchmark_ref: "HESA-STU-DOMICILE-OVERSEAS",
    description: "If student nationality is not UK, DOMICILE should not be a UK code",
    evaluate: (record) => {
      const domicile = record["domicile"] as string;
      const nationality = record["nationality"] as string;
      if (!domicile || !nationality) return { pass: true };
      // UK nationals: ISO codes 826 (GB) / common UK nationalities
      const ukNationalities = new Set(["826", "042", "GB"]);
      if (!ukNationalities.has(nationality) && UK_DOMICILE_CODES.has(domicile)) {
        return {
          pass: false,
          message: `Student has non-UK nationality (${nationality}) but UK DOMICILE code (${domicile}). Please verify.`,
        };
      }
      return { pass: true };
    },
  },
];
