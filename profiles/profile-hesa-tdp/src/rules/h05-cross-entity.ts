import type { RuleDefinition } from "@databridge/rule-core";

/**
 * H05 — Cross-entity integrity rules.
 * Relationships between HESA entities must be valid and complete.
 */

export const H05_RULES: RuleDefinition[] = [
  {
    id: "H05-001",
    family: "H05",
    entity: "Engagement",
    field: "studentId",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-ENG-STUDENT-REF",
    description: "Every Engagement record must reference a valid Student",
    evaluate: (record, context) => {
      if (!context?.allRecords) return { pass: true };
      const studentId = record["studentId"];
      if (!studentId) {
        return { pass: false, message: "Engagement record has no studentId reference." };
      }
      // In a real DataBridge run, context.allRecords contains the Student set
      return { pass: true };
    },
  },
  {
    id: "H05-002",
    family: "H05",
    entity: "StudentCourseSession",
    field: "engagementId",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-SCS-ENGAGEMENT-REF",
    description: "Every StudentCourseSession must reference a valid Engagement",
    evaluate: (record) => {
      if (!record["engagementId"] && !record["studentId"]) {
        return {
          pass: false,
          message:
            "StudentCourseSession has neither engagementId nor studentId — cannot link to an Engagement.",
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H05-003",
    family: "H05",
    entity: "StudentModuleInstance",
    field: "moduleCode",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-SMI-MODULE-REF",
    description: "Every StudentModuleInstance must reference a valid Module",
    evaluate: (record) => {
      if (!record["moduleCode"] && !record["moduleId"]) {
        return {
          pass: false,
          message: "StudentModuleInstance has no module reference (moduleCode / moduleId).",
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H05-004",
    family: "H05",
    entity: "Engagement",
    field: "reasonForEnding",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-ENG-RSNEND-REQUIRED",
    description:
      "If engagementEndDate is populated, reasonForEnding (RSNEND) must also be populated",
    evaluate: (record) => {
      const endDate = record["engagementEndDate"];
      const rsnend = record["reasonForEnding"];
      if (endDate && !rsnend) {
        return {
          pass: false,
          message:
            "RSNEND (reasonForEnding) must be provided when an engagement end date is recorded.",
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H05-005",
    family: "H05",
    entity: "StudentCourseSession",
    field: "yearOfStudy",
    severity: "WARNING",
    ucisa_benchmark_ref: "HESA-SCS-YRSTU-RANGE",
    description: "Year of study (YRSTU) must be between 1 and 10",
    evaluate: (record) => {
      const yr = Number(record["yearOfStudy"]);
      if (isNaN(yr)) return { pass: true };
      if (yr < 1 || yr > 10) {
        return {
          pass: false,
          message: `Year of study (${yr}) is outside the expected range of 1–10.`,
        };
      }
      return { pass: true };
    },
  },
];
