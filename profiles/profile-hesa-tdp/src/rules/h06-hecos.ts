import type { RuleDefinition } from "@databridge/rule-core";

/**
 * H06 — HECoS subject code validation.
 * HECoS (Higher Education Classification of Subjects) codes must be
 * exactly 6 digits. HESA replaced JACS3 with HECoS from C18051 onwards.
 */

function isValidHecosCode(code: unknown): boolean {
  if (typeof code !== "string") return false;
  return /^\d{6}$/.test(code);
}

export const H06_RULES: RuleDefinition[] = [
  {
    id: "H06-001",
    family: "H06",
    entity: "StudentCourseSession",
    field: "hecosSubject1",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-SCS-HECOS1-FORMAT",
    description: "HECOS1 must be a 6-digit numeric code",
    evaluate: (record) => {
      const code = record["hecosSubject1"];
      if (!code) return { pass: true }; // H03-006 covers missing
      if (!isValidHecosCode(code)) {
        return {
          pass: false,
          message: `HECOS1 value "${code}" is not a valid 6-digit HECoS code.`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H06-002",
    family: "H06",
    entity: "StudentCourseSession",
    field: "hecosSubject2",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-SCS-HECOS2-FORMAT",
    description: "HECOS2, when provided, must be a 6-digit numeric code",
    evaluate: (record) => {
      const code = record["hecosSubject2"];
      if (!code) return { pass: true };
      if (!isValidHecosCode(code)) {
        return {
          pass: false,
          message: `HECOS2 value "${code}" is not a valid 6-digit HECoS code.`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H06-003",
    family: "H06",
    entity: "StudentCourseSession",
    field: "hecosSubject3",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-SCS-HECOS3-FORMAT",
    description: "HECOS3, when provided, must be a 6-digit numeric code",
    evaluate: (record) => {
      const code = record["hecosSubject3"];
      if (!code) return { pass: true };
      if (!isValidHecosCode(code)) {
        return {
          pass: false,
          message: `HECOS3 value "${code}" is not a valid 6-digit HECoS code.`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H06-004",
    family: "H06",
    entity: "Module",
    field: "hecosSubject",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-MOD-MODHECOS-FORMAT",
    description: "MODHECOS must be a 6-digit numeric code",
    evaluate: (record) => {
      const code = record["hecosSubject"];
      if (!code) return { pass: true }; // H03-008 covers missing
      if (!isValidHecosCode(code)) {
        return {
          pass: false,
          message: `MODHECOS value "${code}" is not a valid 6-digit HECoS code.`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H06-005",
    family: "H06",
    entity: "StudentCourseSession",
    field: "hecosSubject1",
    severity: "WARNING",
    ucisa_benchmark_ref: "HESA-SCS-HECOS-JACS-WARN",
    description:
      "JACS3 codes (letter + 3 digits) are no longer valid — must use 6-digit HECoS codes",
    evaluate: (record) => {
      const fields = ["hecosSubject1", "hecosSubject2", "hecosSubject3"];
      for (const field of fields) {
        const code = record[field] as string | undefined;
        if (code && /^[A-Z]\d{3}$/.test(code)) {
          return {
            pass: false,
            message: `Field "${field}" contains a JACS3 code ("${code}"). JACS3 codes are not valid in C25061 — use 6-digit HECoS codes.`,
          };
        }
      }
      return { pass: true };
    },
  },
];
