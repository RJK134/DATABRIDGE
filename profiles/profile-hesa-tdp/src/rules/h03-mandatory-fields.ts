import type { RuleDefinition } from "@databridge/rule-core";

/**
 * H03 — Mandatory field completeness rules.
 * Core fields that must be populated on every record of the given entity.
 */

export const H03_RULES: RuleDefinition[] = [
  {
    id: "H03-001",
    family: "H03",
    entity: "Student",
    field: "lastName",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-STU-SURNAME",
    description: "SURNAME must be present on every Student record",
    evaluate: (record) => {
      if (!record["lastName"] || String(record["lastName"]).trim() === "") {
        return { pass: false, message: "SURNAME (lastName) is missing or blank." };
      }
      return { pass: true };
    },
  },
  {
    id: "H03-002",
    family: "H03",
    entity: "Student",
    field: "firstName",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-STU-FNAMES",
    description: "FNAMES must be present on every Student record",
    evaluate: (record) => {
      if (!record["firstName"] || String(record["firstName"]).trim() === "") {
        return { pass: false, message: "FNAMES (firstName) is missing or blank." };
      }
      return { pass: true };
    },
  },
  {
    id: "H03-003",
    family: "H03",
    entity: "Student",
    field: "dateOfBirth",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-STU-BIRTHDTE",
    description: "BIRTHDTE must be present on every Student record",
    evaluate: (record) => {
      if (!record["dateOfBirth"]) {
        return { pass: false, message: "BIRTHDTE (dateOfBirth) is missing." };
      }
      return { pass: true };
    },
  },
  {
    id: "H03-004",
    family: "H03",
    entity: "Student",
    field: "nationality",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-STU-NATION",
    description: "NATION must be present on every Student record",
    evaluate: (record) => {
      if (!record["nationality"] || String(record["nationality"]).trim() === "") {
        return { pass: false, message: "NATION (nationality) is missing." };
      }
      return { pass: true };
    },
  },
  {
    id: "H03-005",
    family: "H03",
    entity: "StudentCourseSession",
    field: "qualificationAim",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-SCS-COURSEAIM",
    description: "COURSEAIM must be present on every StudentCourseSession record",
    evaluate: (record) => {
      if (!record["qualificationAim"] || String(record["qualificationAim"]).trim() === "") {
        return { pass: false, message: "COURSEAIM (qualificationAim) is missing." };
      }
      return { pass: true };
    },
  },
  {
    id: "H03-006",
    family: "H03",
    entity: "StudentCourseSession",
    field: "hecosSubject1",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-SCS-HECOS1",
    description: "HECOS1 (primary HECoS subject) must be present on every StudentCourseSession",
    evaluate: (record) => {
      if (!record["hecosSubject1"] || String(record["hecosSubject1"]).trim() === "") {
        return {
          pass: false,
          message:
            "HECOS1 (hecosSubject1) is missing. Every course session must have a primary HECoS subject code.",
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H03-007",
    family: "H03",
    entity: "Module",
    field: "moduleCode",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-MOD-MODID",
    description: "MODID must be present on every Module record",
    evaluate: (record) => {
      if (!record["moduleCode"] || String(record["moduleCode"]).trim() === "") {
        return { pass: false, message: "MODID (moduleCode) is missing." };
      }
      return { pass: true };
    },
  },
  {
    id: "H03-008",
    family: "H03",
    entity: "Module",
    field: "hecosSubject",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-MOD-MODHECOS",
    description: "MODHECOS must be present on every Module record",
    evaluate: (record) => {
      if (!record["hecosSubject"] || String(record["hecosSubject"]).trim() === "") {
        return {
          pass: false,
          message:
            "MODHECOS (hecosSubject) is missing. Every module must have a HECoS subject code.",
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H03-009",
    family: "H03",
    entity: "Engagement",
    field: "engagementStartDate",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-ENG-ENGDATE",
    description: "ENGDATE must be present on every Engagement record",
    evaluate: (record) => {
      if (!record["engagementStartDate"]) {
        return { pass: false, message: "ENGDATE (engagementStartDate) is missing." };
      }
      return { pass: true };
    },
  },
];
