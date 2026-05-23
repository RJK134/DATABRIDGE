import type { AuditRule } from "@databridge/rule-core";

/**
 * F07 — Finance consistency
 * UCISA Data Management Benchmark §3.6
 */
export const F07_finance_consistency: AuditRule[] = [
  {
    id: "F07-01",
    family: "F07",
    type: "sql",
    name: "Fee liability record missing for active enrolment",
    description: "Active enrolment has no corresponding fee liability record (SFE)",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-3.6",
    tags: ["finance", "sits"],
    enabledByDefault: true,
    sql: `SELECT SRS_CODE AS subject_id, SRS_STUC AS student_id
           FROM SRS
          WHERE SRS_ENDD IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM SFE WHERE SFE_SRSC = SRS_CODE AND SFE_TENT = :tenantId
            )
            AND SRS_TENT = :tenantId`,
    messageTemplate: "Active enrolment {{subject_id}} (student {{student_id}}) has no fee liability record"
  },
  {
    id: "F07-02",
    family: "F07",
    type: "sql",
    name: "Fee amount is negative",
    description: "Fee liability record has a negative fee amount",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.6",
    tags: ["finance", "sits"],
    enabledByDefault: true,
    sql: `SELECT SFE_CODE AS subject_id, SFE_SRSC AS enrolment_id, SFE_AMNT AS amount
           FROM SFE
          WHERE SFE_AMNT < 0
            AND SFE_TENT = :tenantId`,
    messageTemplate: "Fee record {{subject_id}} on enrolment {{enrolment_id}} has negative amount: {{amount}}"
  }
];
