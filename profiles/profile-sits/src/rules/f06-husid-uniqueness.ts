import type { AuditRule } from "@databridge/rule-core";

/**
 * F06 — HUSID uniqueness and format
 * UCISA Data Management Benchmark §3.5 — Uniqueness
 */
export const F06_husid_uniqueness: AuditRule[] = [
  {
    id: "F06-01",
    family: "F06",
    type: "sql",
    name: "Duplicate HUSID across students",
    description: "Two or more student records share the same HUSID",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.5",
    tags: ["uniqueness", "hesa-df", "sits"],
    enabledByDefault: true,
    sql: `SELECT STU_HUSID AS subject_id, COUNT(*) AS record_count
           FROM STU
          WHERE STU_HUSID IS NOT NULL
            AND STU_TENT = :tenantId
          GROUP BY STU_HUSID
         HAVING COUNT(*) > 1`,
    messageTemplate: "HUSID {{subject_id}} is shared by {{record_count}} student records — must be unique"
  },
  {
    id: "F06-02",
    family: "F06",
    type: "sql",
    name: "HUSID format invalid",
    description: "HUSID does not match the 13-digit HESA format",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.5",
    tags: ["uniqueness", "hesa-df", "format", "sits"],
    enabledByDefault: true,
    sql: `SELECT STU_CODE AS subject_id, STU_HUSID AS husid
           FROM STU
          WHERE STU_HUSID IS NOT NULL
            AND STU_HUSID !~ '^[0-9]{13}$'
            AND STU_TENT = :tenantId`,
    messageTemplate: "Student {{subject_id}} has malformed HUSID '{{husid}}' — expected 13 digits"
  },
  {
    id: "F06-03",
    family: "F06",
    type: "statistical",
    name: "HUSID population rate below threshold",
    description: "Less than 95% of active students have a HUSID populated",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-3.5",
    tags: ["uniqueness", "hesa-df", "statistical", "sits"],
    enabledByDefault: true,
    fieldPath: "Student.husid",
    maxNullPct: 5
  }
];
