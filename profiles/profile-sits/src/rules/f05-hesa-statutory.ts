import type { AuditRule } from "@databridge/rule-core";

/**
 * F05 — HESA statutory return rules
 * Directly implements HESA Data Futures validation checks.
 * UCISA Data Management Benchmark §4.1 — Statutory Compliance
 */
export const F05_hesa_statutory: AuditRule[] = [
  {
    id: "F05-01",
    family: "F05",
    type: "sql",
    name: "Active enrolment missing HUSID",
    description: "Active student enrolment has no HESA Unique Student Identifier",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-4.1",
    tags: ["hesa-df", "statutory", "sits"],
    enabledByDefault: true,
    sql: `SELECT s.STU_CODE AS subject_id, s.STU_SURN AS surname
           FROM STU s
           JOIN SRS r ON r.SRS_STUC = s.STU_CODE AND r.SRS_TENT = :tenantId
          WHERE (s.STU_HUSID IS NULL OR TRIM(s.STU_HUSID) = '')
            AND r.SRS_ENDD IS NULL
            AND s.STU_TENT = :tenantId`,
    messageTemplate:
      "Active student {{subject_id}} ({{surname}}) has no HUSID — required for HESA return",
  },
  {
    id: "F05-02",
    family: "F05",
    type: "sql",
    name: "Programme missing HECoS subject coding",
    description: "Programme has no HECoS subject code — required from HESA Data Futures year 1",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-4.1",
    tags: ["hesa-df", "statutory", "sits"],
    enabledByDefault: true,
    sql: `SELECT POS_CODE AS subject_id, POS_NAME AS title
           FROM POS
          WHERE (POS_HCOS IS NULL OR TRIM(POS_HCOS) = '')
            AND POS_TENT = :tenantId`,
    messageTemplate: "Programme {{subject_id}} ({{title}}) has no HECoS subject coding",
  },
  {
    id: "F05-03",
    family: "F05",
    type: "sql",
    name: "Student missing ethnicity declaration",
    description:
      "Student has no ethnicity record — required for Equality Act monitoring and HESA return",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-4.1",
    tags: ["hesa-df", "statutory", "equality", "sits"],
    enabledByDefault: true,
    sql: `SELECT s.STU_CODE AS subject_id, s.STU_SURN AS surname
           FROM STU s
          WHERE NOT EXISTS (
            SELECT 1 FROM SIT_ETH e
             WHERE e.ETH_STUC = s.STU_CODE AND e.ETH_TENT = :tenantId
          )
            AND s.STU_TENT = :tenantId`,
    messageTemplate: "Student {{subject_id}} ({{surname}}) has no ethnicity declaration",
  },
  {
    id: "F05-04",
    family: "F05",
    type: "sql",
    name: "Student missing nationality / domicile",
    description:
      "Student has no nationality/domicile record — required for fee classification and HESA",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-4.1",
    tags: ["hesa-df", "statutory", "sits"],
    enabledByDefault: true,
    sql: `SELECT s.STU_CODE AS subject_id
           FROM STU s
          WHERE NOT EXISTS (
            SELECT 1 FROM SIT_NAT n
             WHERE n.NAT_STUC = s.STU_CODE AND n.NAT_TENT = :tenantId
          )
            AND s.STU_TENT = :tenantId`,
    messageTemplate: "Student {{subject_id}} has no nationality/domicile record",
  },
  {
    id: "F05-05",
    family: "F05",
    type: "sql",
    name: "Enrolment funding body not populated for home/EU student",
    description:
      "Home/EU classified enrolment has no funding body — required for OfS statutory return",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-4.1",
    tags: ["hesa-df", "statutory", "sits", "ofs"],
    enabledByDefault: true,
    sql: `SELECT SRS_CODE AS subject_id, SRS_STUC AS student_id
           FROM SRS
          WHERE (SRS_FUND IS NULL OR TRIM(SRS_FUND) = '')
            AND SRS_FDOM IN ('1', '2')  -- Home / EU domicile markers
            AND SRS_TENT = :tenantId`,
    messageTemplate:
      "Home/EU enrolment {{subject_id}} (student {{student_id}}) has no funding body",
  },
];
