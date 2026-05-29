import type { Rule } from "@databridge/rule-core";

export const husidFormatRule: Rule = {
  id: "HESA-TDP-001",
  family: "FORMAT",
  severity: "ERROR",
  entity: "Student",
  field: "HUSID",
  label: "HUSID format",
  description: "HUSID must be exactly 13 digits. The first digit must be 0 for active students.",
  ucisa_benchmark_ref: null,
  evaluate({ value }: { value: unknown }) {
    if (typeof value !== "string") return { pass: false, message: "HUSID must be a string" };
    if (!/^\d{13}$/.test(value)) {
      return { pass: false, message: `HUSID "${value}" is not 13 digits` };
    }
    return { pass: true };
  },
};
