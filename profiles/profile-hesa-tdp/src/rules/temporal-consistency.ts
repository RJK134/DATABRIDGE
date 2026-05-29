import type { Rule } from "@databridge/rule-core";

export const temporalConsistencyRules: Rule[] = [
  {
    id: "HESA-TDP-020",
    family: "TEMPORAL",
    severity: "ERROR",
    entity: "StudentCourseSession",
    field: "ENDDATE",
    label: "End date after commencement date",
    description: "ENDDATE must be on or after COMDATE when both are present.",
    ucisa_benchmark_ref: null,
    evaluate({ record }: { record: Record<string, unknown> }) {
      const COMDATE = record["COMDATE"];
      const ENDDATE = record["ENDDATE"];
      if (!COMDATE || !ENDDATE) return { pass: true };
      const com = new Date(String(COMDATE));
      const end = new Date(String(ENDDATE));
      if (isNaN(com.getTime()) || isNaN(end.getTime())) return { pass: true }; // caught by FORMAT rules
      if (end < com) {
        return { pass: false, message: `ENDDATE (${ENDDATE}) is before COMDATE (${COMDATE})` };
      }
      return { pass: true };
    },
  },
  {
    id: "HESA-TDP-021",
    family: "TEMPORAL",
    severity: "WARNING",
    entity: "Student",
    field: "BIRTHDTE",
    label: "Plausible date of birth",
    description: "BIRTHDTE should result in an age between 14 and 100 at course commencement.",
    ucisa_benchmark_ref: null,
    evaluate({ value }: { value: unknown }) {
      if (!value) return { pass: true };
      const dob = new Date(String(value));
      if (isNaN(dob.getTime())) return { pass: true };
      const ageNow = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (ageNow < 14 || ageNow > 100) {
        return { pass: false, message: `Implausible date of birth: age ${Math.round(ageNow)}` };
      }
      return { pass: true };
    },
  },
];
