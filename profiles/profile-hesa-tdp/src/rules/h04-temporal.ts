import type { RuleDefinition } from "@databridge/rule-core";

/**
 * H04 — Temporal consistency rules.
 * Date fields must be logically consistent with each other.
 */

function toDate(val: unknown): Date | null {
  if (!val) return null;
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

export const H04_RULES: RuleDefinition[] = [
  {
    id: "H04-001",
    family: "H04",
    entity: "Engagement",
    field: "engagementEndDate",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-ENG-DATES-ORDER",
    description: "Engagement end date must not be before start date",
    evaluate: (record) => {
      const start = toDate(record["engagementStartDate"]);
      const end = toDate(record["engagementEndDate"]);
      if (!start || !end) return { pass: true };
      if (end < start) {
        return {
          pass: false,
          message: `Engagement end date (${record["engagementEndDate"]}) is before start date (${record["engagementStartDate"]}).`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H04-002",
    family: "H04",
    entity: "Student",
    field: "dateOfBirth",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-STU-DOB-FUTURE",
    description: "Date of birth must not be in the future",
    evaluate: (record) => {
      const dob = toDate(record["dateOfBirth"]);
      if (!dob) return { pass: true };
      if (dob > new Date()) {
        return {
          pass: false,
          message: `Date of birth (${record["dateOfBirth"]}) is in the future.`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H04-003",
    family: "H04",
    entity: "Student",
    field: "dateOfBirth",
    severity: "WARNING",
    ucisa_benchmark_ref: "HESA-STU-DOB-IMPLAUSIBLE",
    description: "Student should be between 14 and 100 years old at engagement start",
    evaluate: (record) => {
      const dob = toDate(record["dateOfBirth"]);
      if (!dob) return { pass: true };
      const now = new Date();
      const ageYears = (now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (ageYears < 14 || ageYears > 100) {
        return {
          pass: false,
          message: `Student age (${Math.floor(ageYears)}) is outside the plausible range of 14–100 years.`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H04-004",
    family: "H04",
    entity: "Engagement",
    field: "engagementStartDate",
    severity: "WARNING",
    ucisa_benchmark_ref: "HESA-ENG-DATE-PLAUSIBLE",
    description: "Engagement start date should fall within a plausible academic year range",
    evaluate: (record) => {
      const start = toDate(record["engagementStartDate"]);
      if (!start) return { pass: true };
      const earliestPlausible = new Date("1990-01-01");
      const latestPlausible = new Date();
      latestPlausible.setFullYear(latestPlausible.getFullYear() + 1);
      if (start < earliestPlausible || start > latestPlausible) {
        return {
          pass: false,
          message: `Engagement start date (${record["engagementStartDate"]}) is outside the plausible range (1990 to next year).`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H04-005",
    family: "H04",
    entity: "Engagement",
    field: "engagementEndDate",
    severity: "WARNING",
    ucisa_benchmark_ref: "HESA-ENG-END-AFTER-BIRTHDATE",
    description: "Engagement end date must be after the student date of birth",
    evaluate: (record) => {
      const dob = toDate(record["dateOfBirth"]);
      const end = toDate(record["engagementEndDate"]);
      if (!dob || !end) return { pass: true };
      if (end <= dob) {
        return {
          pass: false,
          message: `Engagement end date (${record["engagementEndDate"]}) is not after date of birth (${record["dateOfBirth"]}).`,
        };
      }
      return { pass: true };
    },
  },
];
