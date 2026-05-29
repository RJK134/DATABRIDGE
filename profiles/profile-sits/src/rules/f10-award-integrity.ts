import type { AuditRule } from "@databridge/rule-core";

/**
 * F10 — Award integrity
 * UCISA Data Management Benchmark §3.8
 */
export const F10_award_integrity: AuditRule[] = [
  {
    id: "F10-01",
    family: "F10",
    type: "sql",
    name: "Award with class of honours but non-honours qualification aim",
    description:
      "SAW record has a class of honours populated but the qualification aim is not an honours degree",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.8",
    tags: ["award", "hesa-df", "sits"],
    enabledByDefault: true,
    sql: `SELECT SAW_CODE AS subject_id, SAW_STUC AS student_id,
                  SAW_QAIM AS qual_aim, SAW_CLAW AS class_of_award
           FROM SAW
          WHERE SAW_CLAW IS NOT NULL
            AND SAW_QAIM NOT IN ('H00', 'H11', 'H12', 'H13', 'H14', 'H16', 'H20')
            AND SAW_TENT = :tenantId`,
    messageTemplate:
      "Award {{subject_id}}: class of honours '{{class_of_award}}' set but qualification aim '{{qual_aim}}' is not honours",
  },
  {
    id: "F10-02",
    family: "F10",
    type: "sql",
    name: "Completed enrolment with no award record",
    description:
      "Enrolment has an end date and reason for ending implying completion, but no award record exists",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-3.8",
    tags: ["award", "hesa-df", "sits"],
    enabledByDefault: true,
    sql: `SELECT SRS_CODE AS subject_id, SRS_STUC AS student_id
           FROM SRS
          WHERE SRS_ENDD IS NOT NULL
            AND SRS_REND IN ('SUCC', 'COMP', '01', '02')
            AND NOT EXISTS (
              SELECT 1 FROM SAW WHERE SAW_STUC = SRS_STUC AND SAW_TENT = :tenantId
            )
            AND SRS_TENT = :tenantId`,
    messageTemplate:
      "Enrolment {{subject_id}} (student {{student_id}}) completed but has no award record",
  },
];
