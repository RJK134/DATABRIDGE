import type { AuditRule } from "@databridge/rule-core";

/**
 * F09 — Programme structure integrity
 * UCISA Data Management Benchmark §3.7
 */
export const F09_programme_structure: AuditRule[] = [
  {
    id: "F09-01",
    family: "F09",
    type: "sql",
    name: "Programme has no module associations",
    description: "Programme of study has no linked modules in the module availability tables",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-3.7",
    tags: ["programme-structure", "sits"],
    enabledByDefault: true,
    sql: `SELECT POS_CODE AS subject_id, POS_NAME AS title
           FROM POS
          WHERE NOT EXISTS (
            SELECT 1 FROM MAR
             WHERE MAR_POSC = POS_CODE AND MAR_TENT = :tenantId
          )
            AND POS_TENT = :tenantId`,
    messageTemplate: "Programme {{subject_id}} ({{title}}) has no module associations",
  },
  {
    id: "F09-02",
    family: "F09",
    type: "sql",
    name: "Programme JACS3 and HECoS codes both missing",
    description: "Programme has neither JACS3 nor HECoS subject coding — at least one is required",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.7",
    tags: ["programme-structure", "hesa-df", "sits"],
    enabledByDefault: true,
    sql: `SELECT POS_CODE AS subject_id, POS_NAME AS title
           FROM POS
          WHERE (POS_JAC3 IS NULL OR TRIM(POS_JAC3) = '')
            AND (POS_HCOS IS NULL OR TRIM(POS_HCOS) = '')
            AND POS_TENT = :tenantId`,
    messageTemplate: "Programme {{subject_id}} ({{title}}) has no JACS3 or HECoS subject coding",
  },
];
