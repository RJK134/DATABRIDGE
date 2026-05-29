import type { AuditRule } from "@databridge/rule-core";

/**
 * F08 — Duplicate student detection
 * UCISA Data Management Benchmark §3.5 — Uniqueness
 */
export const F08_duplicate_detection: AuditRule[] = [
  {
    id: "F08-01",
    family: "F08",
    type: "sql",
    name: "Likely duplicate students (name + DOB match)",
    description:
      "Two or more student records share identical surname, forenames, and date of birth",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-3.5",
    tags: ["duplicates", "sits"],
    enabledByDefault: true,
    sql: `SELECT MIN(STU_CODE) AS subject_id,
                  STU_SURN AS surname, STU_FORE AS forenames,
                  STU_DOB AS dob, COUNT(*) AS record_count
           FROM STU
          WHERE STU_TENT = :tenantId
          GROUP BY STU_SURN, STU_FORE, STU_DOB
         HAVING COUNT(*) > 1`,
    messageTemplate:
      "{{record_count}} students share name '{{surname}}, {{forenames}}' and DOB {{dob}} — possible duplicates",
  },
  {
    id: "F08-02",
    family: "F08",
    type: "llm",
    name: "AI-assisted fuzzy duplicate detection",
    description:
      "Uses LLM to identify probable duplicate student records where name variants or data entry differences obscure exact matches. Always requires human approval before any merge action.",
    severity: "INFO",
    ucisa_benchmark_ref: "UCISA-DM-3.5",
    tags: ["duplicates", "ai", "sits"],
    enabledByDefault: false,
    promptTemplate:
      "Review these student records and identify any that are likely duplicates of each other, considering name variants, typos, and transposed dates of birth:\n\n{{context}}\n\nReturn a list of probable duplicate pairs with confidence scores.",
    outputSchema: "anomaly-finding",
  },
];
