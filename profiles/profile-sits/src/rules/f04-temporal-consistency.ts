import type { AuditRule } from "@databridge/rule-core";

/**
 * F04 — Temporal consistency
 * UCISA Data Management Benchmark §3.4
 */
export const F04_temporal_consistency: AuditRule[] = [
  {
    id: "F04-01",
    family: "F04",
    type: "sql",
    name: "Enrolment end date before start date",
    description: "SRS_ENDD is earlier than SRS_BEGD",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.4",
    tags: ["temporal", "sits"],
    enabledByDefault: true,
    sql: `SELECT SRS_CODE AS subject_id, SRS_STUC AS student_id,
                  SRS_BEGD AS start_date, SRS_ENDD AS end_date
           FROM SRS
          WHERE SRS_ENDD IS NOT NULL
            AND SRS_ENDD < SRS_BEGD
            AND SRS_TENT = :tenantId`,
    messageTemplate:
      "Enrolment {{subject_id}}: end date {{end_date}} is before start date {{start_date}}",
  },
  {
    id: "F04-02",
    family: "F04",
    type: "sql",
    name: "Student date of birth in the future",
    description: "STU_DOB is a future date",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.4",
    tags: ["temporal", "sits"],
    enabledByDefault: true,
    sql: `SELECT STU_CODE AS subject_id, STU_DOB AS dob
           FROM STU
          WHERE STU_DOB > CURRENT_DATE
            AND STU_TENT = :tenantId`,
    messageTemplate: "Student {{subject_id}} has a future date of birth: {{dob}}",
  },
  {
    id: "F04-03",
    family: "F04",
    type: "sql",
    name: "Enrolment start predates institution founding",
    description: "SRS_BEGD is before the institution's earliest valid date (1900-01-01)",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-3.4",
    tags: ["temporal", "sits"],
    enabledByDefault: true,
    sql: `SELECT SRS_CODE AS subject_id, SRS_BEGD AS start_date
           FROM SRS
          WHERE SRS_BEGD < DATE '1900-01-01'
            AND SRS_TENT = :tenantId`,
    messageTemplate: "Enrolment {{subject_id}} has implausibly early start date: {{start_date}}",
  },
  {
    id: "F04-04",
    family: "F04",
    type: "sql",
    name: "Award date before enrolment start date",
    description: "Award conferred before the student's enrolment began",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.4",
    tags: ["temporal", "hesa-df", "sits"],
    enabledByDefault: true,
    sql: `SELECT saw.SAW_CODE AS subject_id, saw.SAW_STUC AS student_id,
                  saw.SAW_DAWD AS award_date, srs.SRS_BEGD AS enrol_start
           FROM SAW saw
           JOIN SRS srs ON srs.SRS_STUC = saw.SAW_STUC AND srs.SRS_TENT = :tenantId
          WHERE saw.SAW_DAWD IS NOT NULL
            AND saw.SAW_DAWD < srs.SRS_BEGD
            AND saw.SAW_TENT = :tenantId`,
    messageTemplate:
      "Award {{subject_id}}: award date {{award_date}} is before enrolment start {{enrol_start}}",
  },
];
