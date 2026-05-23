import type { AuditRule } from "@databridge/rule-core";

/**
 * F01 — Mandatory field completeness
 * Checks that fields required for HESA submission are populated.
 * UCISA Data Management Benchmark §3.1 — Data Completeness
 */
export const F01_completeness: AuditRule[] = [
  {
    id: "F01-01",
    family: "F01",
    type: "sql",
    name: "Student surname missing",
    description: "Student record has no surname (STU_SURN is null or empty)",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.1",
    tags: ["completeness", "hesa-df", "sits"],
    enabledByDefault: true,
    sql: `SELECT STU_CODE AS subject_id, STU_FORE AS forenames, STU_DOB AS dob
           FROM STU
          WHERE (STU_SURN IS NULL OR TRIM(STU_SURN) = '')
            AND STU_TENT = :tenantId`,
    messageTemplate: "Student {{subject_id}} ({{forenames}}, dob {{dob}}) has no surname"
  },
  {
    id: "F01-02",
    family: "F01",
    type: "sql",
    name: "Student date of birth missing",
    description: "Student record has no date of birth",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.1",
    tags: ["completeness", "hesa-df", "sits"],
    enabledByDefault: true,
    sql: `SELECT STU_CODE AS subject_id, STU_SURN AS surname, STU_FORE AS forenames
           FROM STU
          WHERE STU_DOB IS NULL
            AND STU_TENT = :tenantId`,
    messageTemplate: "Student {{subject_id}} ({{surname}}, {{forenames}}) has no date of birth"
  },
  {
    id: "F01-03",
    family: "F01",
    type: "sql",
    name: "Enrolment missing programme code",
    description: "Enrolment (SRS) record has no programme code",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.1",
    tags: ["completeness", "hesa-df", "sits"],
    enabledByDefault: true,
    sql: `SELECT SRS_CODE AS subject_id, SRS_STUC AS student_id
           FROM SRS
          WHERE (SRS_PROG IS NULL OR TRIM(SRS_PROG) = '')
            AND SRS_TENT = :tenantId`,
    messageTemplate: "Enrolment {{subject_id}} for student {{student_id}} has no programme code"
  },
  {
    id: "F01-04",
    family: "F01",
    type: "sql",
    name: "Enrolment missing start date",
    description: "Enrolment record has no commencement date (SRS_BEGD)",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.1",
    tags: ["completeness", "hesa-df", "sits"],
    enabledByDefault: true,
    sql: `SELECT SRS_CODE AS subject_id, SRS_STUC AS student_id, SRS_PROG AS programme
           FROM SRS
          WHERE SRS_BEGD IS NULL
            AND SRS_TENT = :tenantId`,
    messageTemplate: "Enrolment {{subject_id}} (student {{student_id}}, programme {{programme}}) has no start date"
  },
  {
    id: "F01-05",
    family: "F01",
    type: "sql",
    name: "Programme missing title",
    description: "Programme of study record has no title",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-3.1",
    tags: ["completeness", "sits"],
    enabledByDefault: true,
    sql: `SELECT POS_CODE AS subject_id
           FROM POS
          WHERE (POS_NAME IS NULL OR TRIM(POS_NAME) = '')
            AND POS_TENT = :tenantId`,
    messageTemplate: "Programme {{subject_id}} has no title"
  },
  {
    id: "F01-06",
    family: "F01",
    type: "sql",
    name: "Module missing credit value",
    description: "Module has no credit point value — required for HESA module return",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-3.1",
    tags: ["completeness", "hesa-df", "sits"],
    enabledByDefault: true,
    sql: `SELECT MOD_CODE AS subject_id, MOD_NAME AS title
           FROM MOD
          WHERE MOD_CRDT IS NULL
            AND MOD_TENT = :tenantId`,
    messageTemplate: "Module {{subject_id}} ({{title}}) has no credit value"
  }
];
