import type { AuditRule } from "@databridge/rule-core";

/**
 * F12 — Agent relationship compliance (international recruitment)
 * UCISA Data Management Benchmark §5.1 — Third-party compliance
 */
export const F12_agent_compliance: AuditRule[] = [
  {
    id: "F12-01",
    family: "F12",
    type: "sql",
    name: "Agent relationship references non-existent student",
    description: "AGT record has no matching student",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-5.1",
    tags: ["agent", "compliance", "international", "sits"],
    enabledByDefault: true,
    sql: `SELECT AGT_CODE AS subject_id, AGT_STUC AS student_id
           FROM AGT
          WHERE AGT_STUC NOT IN (SELECT STU_CODE FROM STU WHERE STU_TENT = :tenantId)
            AND AGT_TENT = :tenantId`,
    messageTemplate:
      "Agent relationship {{subject_id}} references non-existent student {{student_id}}",
  },
  {
    id: "F12-02",
    family: "F12",
    type: "sql",
    name: "International student missing agent or direct-apply flag",
    description:
      "International student enrolment has neither an agent link nor a direct-apply marker",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-5.1",
    tags: ["agent", "compliance", "international", "sits"],
    enabledByDefault: false,
    sql: `SELECT s.STU_CODE AS subject_id
           FROM STU s
           JOIN SRS r ON r.SRS_STUC = s.STU_CODE AND r.SRS_TENT = :tenantId
          WHERE r.SRS_FDOM = '3' -- International domicile
            AND NOT EXISTS (SELECT 1 FROM AGT WHERE AGT_STUC = s.STU_CODE AND AGT_TENT = :tenantId)
            AND (s.STU_DAPP IS NULL OR s.STU_DAPP != 'Y')
            AND s.STU_TENT = :tenantId`,
    messageTemplate:
      "International student {{subject_id}} has no agent link and no direct-apply flag",
  },
];
