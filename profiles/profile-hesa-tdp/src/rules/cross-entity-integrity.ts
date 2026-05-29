import type { Rule } from "@databridge/rule-core";

export const crossEntityIntegrityRules: Rule[] = [
  {
    id: "HESA-TDP-030",
    family: "REFERENTIAL",
    severity: "ERROR",
    entity: "Engagement",
    field: "HUSID",
    label: "Engagement references valid Student",
    description: "Every Engagement.HUSID must match an existing Student.HUSID in the submission.",
    ucisa_benchmark_ref: null,
    evaluate({ value, context }: { value: unknown; context: { studentHusids?: Set<string> } }) {
      const husid = String(value ?? "");
      if (!context?.studentHusids) return { pass: true }; // context not provided — skip
      if (!context.studentHusids.has(husid)) {
        return { pass: false, message: `Engagement references unknown HUSID "${husid}"` };
      }
      return { pass: true };
    },
  },
  {
    id: "HESA-TDP-031",
    family: "REFERENTIAL",
    severity: "ERROR",
    entity: "Leaver",
    field: "ENGID",
    label: "Leaver references valid Engagement",
    description: "Every Leaver.ENGID must match an existing Engagement.ENGID.",
    ucisa_benchmark_ref: null,
    evaluate({ value, context }: { value: unknown; context: { engagementIds?: Set<string> } }) {
      const engid = String(value ?? "");
      if (!context?.engagementIds) return { pass: true };
      if (!context.engagementIds.has(engid)) {
        return { pass: false, message: `Leaver references unknown ENGID "${engid}"` };
      }
      return { pass: true };
    },
  },
];
