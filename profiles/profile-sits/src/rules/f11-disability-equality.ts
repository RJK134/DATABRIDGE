import type { AuditRule } from "@databridge/rule-core";

/**
 * F11 — Disability and equality data
 * UCISA Data Management Benchmark §4.2 — Equality Act Compliance
 */
export const F11_disability_equality: AuditRule[] = [
  {
    id: "F11-01",
    family: "F11",
    type: "sql",
    name: "Disability record references non-existent student",
    description: "SDA record has no matching student",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-4.2",
    tags: ["disability", "equality", "sits"],
    enabledByDefault: true,
    sql: `SELECT SDA_CODE AS subject_id, SDA_STUC AS student_id
           FROM SDA
          WHERE SDA_STUC NOT IN (SELECT STU_CODE FROM STU WHERE STU_TENT = :tenantId)
            AND SDA_TENT = :tenantId`,
    messageTemplate:
      "Disability record {{subject_id}} references non-existent student {{student_id}}",
  },
  {
    id: "F11-02",
    family: "F11",
    type: "statistical",
    name: "Disability declaration rate anomaly",
    description:
      "Disability declaration rate is statistically anomalous vs HESA sector benchmark (expected 10–20%)",
    severity: "INFO",
    ucisa_benchmark_ref: "UCISA-DM-4.2",
    tags: ["disability", "equality", "statistical", "sits"],
    enabledByDefault: true,
    fieldPath: "Disability.studentId",
    maxNullPct: 80,
    minCardinality: 1,
  },
];
