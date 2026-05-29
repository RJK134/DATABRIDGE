import type { AuditRule } from "@databridge/rule-core";

/**
 * F02 — Referential integrity
 * UCISA Data Management Benchmark §3.2 — Data Integrity
 */
export const F02_referential_integrity: AuditRule[] = [
  {
    id: "F02-01",
    family: "F02",
    type: "sql",
    name: "Enrolment references non-existent student",
    description: "SRS record has SRS_STUC that does not exist in STU",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["referential-integrity", "sits"],
    enabledByDefault: true,
    sql: `SELECT SRS_CODE AS subject_id, SRS_STUC AS student_id
           FROM SRS
          WHERE SRS_STUC NOT IN (SELECT STU_CODE FROM STU WHERE STU_TENT = :tenantId)
            AND SRS_TENT = :tenantId`,
    messageTemplate:
      "Enrolment {{subject_id}} references student {{student_id}} which does not exist",
  },
  {
    id: "F02-02",
    family: "F02",
    type: "sql",
    name: "Enrolment references non-existent programme",
    description: "SRS record has SRS_PROG that does not exist in POS",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["referential-integrity", "hesa-df", "sits"],
    enabledByDefault: true,
    sql: `SELECT SRS_CODE AS subject_id, SRS_PROG AS programme_code
           FROM SRS
          WHERE SRS_PROG NOT IN (SELECT POS_CODE FROM POS WHERE POS_TENT = :tenantId)
            AND SRS_TENT = :tenantId`,
    messageTemplate:
      "Enrolment {{subject_id}} references programme {{programme_code}} which does not exist",
  },
  {
    id: "F02-03",
    family: "F02",
    type: "sql",
    name: "Module registration references non-existent enrolment",
    description: "SMO record has SMO_SRSC that does not exist in SRS",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["referential-integrity", "sits"],
    enabledByDefault: true,
    sql: `SELECT SMO_CODE AS subject_id, SMO_SRSC AS enrolment_id
           FROM SMO
          WHERE SMO_SRSC NOT IN (SELECT SRS_CODE FROM SRS WHERE SRS_TENT = :tenantId)
            AND SMO_TENT = :tenantId`,
    messageTemplate:
      "Module registration {{subject_id}} references enrolment {{enrolment_id}} which does not exist",
  },
  {
    id: "F02-04",
    family: "F02",
    type: "sql",
    name: "Award references non-existent student",
    description: "SAW record references a student that does not exist",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["referential-integrity", "hesa-df", "sits"],
    enabledByDefault: true,
    sql: `SELECT SAW_CODE AS subject_id, SAW_STUC AS student_id
           FROM SAW
          WHERE SAW_STUC NOT IN (SELECT STU_CODE FROM STU WHERE STU_TENT = :tenantId)
            AND SAW_TENT = :tenantId`,
    messageTemplate: "Award {{subject_id}} references student {{student_id}} which does not exist",
  },
];
