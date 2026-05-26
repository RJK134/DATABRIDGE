/**
 * SITS native integrity rules.
 *
 * Source: SITS_DATA_STRUCTURES.md §19 ("Audit rule hooks") — the ten
 * source-native integrity checks the audit engine should support when
 * running directly against a Tribal SITS:Vision Oracle schema (raw
 * SITS table names, not the DataBridge canonical model).
 *
 * Each rule is a SqlAuditRule executed by the Oracle SQL executor on
 * the SITS source connection. Tenant scoping is via :tenantId.
 *
 * Family: SITS-INTEGRITY.
 */
import type { AuditRule } from "@databridge/rule-core";

export const SITS_NATIVE_RULES: AuditRule[] = [
  {
    id: "SITS-NAT-01",
    family: "SITS-INTEGRITY",
    type: "sql",
    name: "STU row with no matching MST row (orphan student)",
    description:
      "Every student (STU) must FK to a master/person spine (MST) via stu_code. Orphan STU rows indicate a corrupt person merge or a failed identity import.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["sits-native", "referential-integrity", "person"],
    enabledByDefault: true,
    sql: `SELECT s.stu_code AS subject_id, s.stu_surn AS surname, s.stu_fore AS forenames
            FROM stu s
            LEFT JOIN mst m ON m.mst_code = s.stu_code
           WHERE s.stu_tent = :tenantId
             AND m.mst_code IS NULL`,
    messageTemplate:
      "STU {{subject_id}} ({{surname}}, {{forenames}}) has no matching MST row (orphan)",
  },
  {
    id: "SITS-NAT-02",
    family: "SITS-INTEGRITY",
    type: "sql",
    name: "SCJ completed but no SAW award row",
    description:
      "Student course join (SCJ) with scj_stac = 'CC' (course completed) must have a corresponding student award (SAW) row.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["sits-native", "referential-integrity", "award"],
    enabledByDefault: true,
    sql: `SELECT j.scj_code AS subject_id, j.scj_stuc AS student_id, j.scj_crsc AS course_code
            FROM scj j
            LEFT JOIN saw a ON a.saw_scjc = j.scj_code
           WHERE j.scj_tent = :tenantId
             AND j.scj_stac = 'CC'
             AND a.saw_scjc IS NULL`,
    messageTemplate:
      "SCJ {{subject_id}} (student {{student_id}}, course {{course_code}}) is completed but has no SAW award row",
  },
  {
    id: "SITS-NAT-03",
    family: "SITS-INTEGRITY",
    type: "sql",
    name: "SCE registered but no SMO module rows",
    description:
      "Student course enrolment (SCE) with sce_stac = 'R' (registered) must have at least one SMO (student module) row for the same student+year.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["sits-native", "referential-integrity", "enrolment", "module"],
    enabledByDefault: true,
    sql: `SELECT e.sce_code AS subject_id, e.sce_stuc AS student_id, e.sce_ayrc AS academic_year
            FROM sce e
           WHERE e.sce_tent = :tenantId
             AND e.sce_stac = 'R'
             AND NOT EXISTS (
                   SELECT 1
                     FROM smo o
                    WHERE o.smo_stuc = e.sce_stuc
                      AND o.smo_ayrc = e.sce_ayrc
                      AND o.smo_tent = e.sce_tent
                 )`,
    messageTemplate:
      "SCE {{subject_id}} (student {{student_id}}, year {{academic_year}}) is registered but has no SMO module rows",
  },
  {
    id: "SITS-NAT-04",
    family: "SITS-INTEGRITY",
    type: "sql",
    name: "SMR pass with zero credit",
    description:
      "Student module result (SMR) with smr_actc = 'P' (passed) must have non-zero credit awarded (smr_crda > 0). Pass-with-zero-credit is a data-entry symptom of mark-import bugs.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.3",
    tags: ["sits-native", "assessment", "credit"],
    enabledByDefault: true,
    sql: `SELECT r.smr_code AS subject_id, r.smr_stuc AS student_id, r.smr_modc AS module_code, r.smr_ayrc AS academic_year
            FROM smr r
           WHERE r.smr_tent = :tenantId
             AND r.smr_actc = 'P'
             AND (r.smr_crda IS NULL OR r.smr_crda = 0)`,
    messageTemplate:
      "SMR {{subject_id}} (student {{student_id}}, module {{module_code}}, year {{academic_year}}) is a pass with zero credit awarded",
  },
  {
    id: "SITS-NAT-05",
    family: "SITS-INTEGRITY",
    type: "sql",
    name: "SAT row with no parent MAB assessment-body",
    description:
      "Student assessment (SAT) row must FK to a module assessment body (MAB) via sat_mabc. Orphan SAT rows often appear after assessment-pattern reshapes.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["sits-native", "referential-integrity", "assessment"],
    enabledByDefault: true,
    sql: `SELECT t.sat_code AS subject_id, t.sat_stuc AS student_id, t.sat_mabc AS assessment_body
            FROM sat t
            LEFT JOIN mab b ON b.mab_code = t.sat_mabc
           WHERE t.sat_tent = :tenantId
             AND b.mab_code IS NULL`,
    messageTemplate:
      "SAT {{subject_id}} (student {{student_id}}, MAB {{assessment_body}}) has no parent MAB assessment-body row",
  },
  {
    id: "SITS-NAT-06",
    family: "SITS-INTEGRITY",
    type: "sql",
    name: "SCJ missing highest qualification on entry (HESA-reportable)",
    description:
      "For HESA-reportable enrolments, SCJ.scj_hiqp (highest qualification on entry) must be populated. HESA F-coding requires this field on all HE provision.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.1",
    tags: ["sits-native", "hesa", "completeness"],
    enabledByDefault: true,
    sql: `SELECT j.scj_code AS subject_id, j.scj_stuc AS student_id, j.scj_crsc AS course_code
            FROM scj j
            JOIN crs c ON c.crs_code = j.scj_crsc AND c.crs_tent = j.scj_tent
           WHERE j.scj_tent = :tenantId
             AND c.crs_hesa = 'Y'
             AND (j.scj_hiqp IS NULL OR TRIM(j.scj_hiqp) = '')`,
    messageTemplate:
      "SCJ {{subject_id}} (student {{student_id}}, course {{course_code}}) is HESA-reportable but has no highest-qualification-on-entry (scj_hiqp)",
  },
  {
    id: "SITS-NAT-07",
    family: "SITS-INTEGRITY",
    type: "sql",
    name: "VCR expired CAS on active SCE (Student Route compliance)",
    description:
      "Visa/CAS record (VCR) with expiry date in the past where the student still has an active SCE row breaches Student Route / Tier 4 sponsor compliance.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.4",
    tags: ["sits-native", "visa", "compliance", "ukvi"],
    enabledByDefault: true,
    sql: `SELECT v.vcr_code AS subject_id, v.vcr_stuc AS student_id, v.vcr_expd AS cas_expiry
            FROM vcr v
            JOIN sce e ON e.sce_stuc = v.vcr_stuc AND e.sce_tent = v.vcr_tent
           WHERE v.vcr_tent = :tenantId
             AND v.vcr_expd < CURRENT_DATE
             AND e.sce_stac IN ('R', 'C')`,
    messageTemplate:
      "VCR {{subject_id}} (student {{student_id}}) has expired CAS {{cas_expiry}} but an active SCE row",
  },
  {
    id: "SITS-NAT-08",
    family: "SITS-INTEGRITY",
    type: "sql",
    name: "STU date of death set but MST status still active",
    description:
      "If stu_dod (date of death) is populated, the parent MST status (mst_stat) must not be 'A' (active). Stale active status on deceased records is a GDPR / dignity issue.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.5",
    tags: ["sits-native", "person", "gdpr"],
    enabledByDefault: true,
    sql: `SELECT s.stu_code AS subject_id, s.stu_surn AS surname, s.stu_dod AS date_of_death, m.mst_stat AS master_status
            FROM stu s
            JOIN mst m ON m.mst_code = s.stu_code AND m.mst_tent = s.stu_tent
           WHERE s.stu_tent = :tenantId
             AND s.stu_dod IS NOT NULL
             AND m.mst_stat = 'A'`,
    messageTemplate:
      "STU {{subject_id}} ({{surname}}) has date of death {{date_of_death}} but MST status is still '{{master_status}}'",
  },
  {
    id: "SITS-NAT-09",
    family: "SITS-INTEGRITY",
    type: "sql",
    name: "SAW classification set but graduation date null",
    description:
      "Student award (SAW) with classification populated must also have saw_grdd (graduation date). Award without graduation date breaks HESA reporting and progression statistics.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.1",
    tags: ["sits-native", "award", "completeness"],
    enabledByDefault: true,
    sql: `SELECT a.saw_code AS subject_id, a.saw_stuc AS student_id, a.saw_clas AS classification
            FROM saw a
           WHERE a.saw_tent = :tenantId
             AND a.saw_clas IS NOT NULL
             AND TRIM(a.saw_clas) <> ''
             AND a.saw_grdd IS NULL`,
    messageTemplate:
      "SAW {{subject_id}} (student {{student_id}}) has classification '{{classification}}' but no graduation date (saw_grdd)",
  },
  {
    id: "SITS-NAT-10",
    family: "SITS-INTEGRITY",
    type: "sql",
    name: "UDF column with personal data not registered in men_udf",
    description:
      "User-defined-field column appears to contain personal data (NI number, passport, phone, email pattern) but is not registered in men_udf with a GDPR classification. Potential PII leakage into unmanaged fields.",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-3.5",
    tags: ["sits-native", "gdpr", "udf", "pii"],
    enabledByDefault: true,
    sql: `SELECT stu_code AS subject_id,
                 'stu_udf1' AS udf_column,
                 stu_udf1 AS udf_value
            FROM stu
           WHERE stu_tent = :tenantId
             AND stu_udf1 IS NOT NULL
             AND (
                   REGEXP_LIKE(stu_udf1, '^[A-Z]{2}[0-9]{6}[A-Z]?$')
                OR REGEXP_LIKE(stu_udf1, '^[0-9]{9,}$')
                OR REGEXP_LIKE(stu_udf1, '@')
             )
             AND NOT EXISTS (
                   SELECT 1
                     FROM men_udf u
                    WHERE u.udf_ent  = 'STU'
                      AND u.udf_col  = 'STU_UDF1'
                      AND u.udf_tent = :tenantId
                 )`,
    messageTemplate:
      "STU {{subject_id}} column {{udf_column}} contains apparent personal data ('{{udf_value}}') but is not registered in men_udf",
  },
];
