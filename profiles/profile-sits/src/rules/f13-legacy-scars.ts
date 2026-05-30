import type { AuditRule } from "@databridge/rule-core";

/**
 * F13 — Legacy scar rules (LS-01 to LS-08)
 *
 * These are DataBridge's commercially differentiating capability.
 * They detect patterns unique to long-running SITS installations —
 * artefacts of historical system migrations, custom developments,
 * and institutional workarounds that accumulate over years.
 *
 * No other migration tool audits for these patterns.
 * Each rule has a corresponding cleansing proposal template used by
 * the AI Cleansing Proposer agent.
 *
 * UCISA Data Management Benchmark §6.1 — Institutional Data Heritage
 */
export const F13_legacy_scars: AuditRule[] = [
  {
    id: "LS-01",
    family: "F13",
    type: "sql",
    name: "Ghost student records (no enrolment, no application)",
    description:
      "Student records with no enrolment and no application history. Typically created during test migrations, batch imports that were aborted, or legacy system carry-over. Safe to archive but must not be migrated as active students.",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-6.1",
    tags: ["legacy-scar", "migration", "sits"],
    enabledByDefault: true,
    sql: `SELECT s.STU_CODE AS subject_id, s.STU_SURN AS surname,
                  s.STU_FORE AS forenames, s.STU_DOB AS dob
           FROM STU s
          WHERE STU_TENT = :tenantId
            AND NOT EXISTS (SELECT 1 FROM SRS r WHERE r.SRS_STUC = s.STU_CODE AND r.SRS_TENT = :tenantId)
            AND NOT EXISTS (SELECT 1 FROM APP a WHERE a.APP_STUC = s.STU_CODE AND a.APP_TENT = :tenantId)`,
    messageTemplate:
      "Student {{subject_id}} ({{surname}}, {{forenames}}, DOB {{dob}}) has no enrolment or application — ghost record",
  },
  {
    id: "LS-02",
    family: "F13",
    type: "sql",
    name: "Stale UDF values from retired programme structures",
    description:
      "User-defined fields (STU_UDF*) contain coded values that reference programme codes or department codes that no longer exist. Classic scar from curriculum restructuring without data migration.",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-6.1",
    tags: ["legacy-scar", "udf", "migration", "sits"],
    enabledByDefault: true,
    sql: `SELECT STU_CODE AS subject_id, STU_UDF1 AS udf1, STU_UDF2 AS udf2
           FROM STU
          WHERE (
            (STU_UDF1 IS NOT NULL AND STU_UDF1 NOT IN (SELECT POS_CODE FROM POS WHERE POS_TENT = :tenantId))
            OR
            (STU_UDF2 IS NOT NULL AND STU_UDF2 NOT IN (SELECT DPT_CODE FROM DPT WHERE DPT_TENT = :tenantId))
          )
            AND STU_TENT = :tenantId`,
    messageTemplate:
      "Student {{subject_id}} has stale UDF values — UDF1: {{udf1}}, UDF2: {{udf2}} reference retired structures",
  },
  {
    id: "LS-03",
    family: "F13",
    type: "sql",
    name: "Zombie enrolments (ended 10+ years ago with no outcome)",
    description:
      "Enrolment records that ended more than 10 years ago with reason-for-ending codes indicating neither completion nor formal withdrawal. Often data entry omissions from the pre-digital era carried forward through multiple migrations.",
    severity: "INFO",
    ucisa_benchmark_ref: "UCISA-DM-6.1",
    tags: ["legacy-scar", "migration", "sits"],
    enabledByDefault: true,
    sql: `SELECT SRS_CODE AS subject_id, SRS_STUC AS student_id,
                  SRS_ENDD AS end_date, SRS_REND AS reason
           FROM SRS
          WHERE SRS_ENDD IS NOT NULL
            AND SRS_ENDD < CURRENT_DATE - INTERVAL '10 years'
            AND (SRS_REND IS NULL OR SRS_REND NOT IN ('SUCC', 'COMP', 'WDDR', 'EXCL', '01', '02', '03', '04', '05'))
            AND SRS_TENT = :tenantId`,
    messageTemplate:
      "Enrolment {{subject_id}} (student {{student_id}}) ended {{end_date}} with unresolved outcome '{{reason}}' — zombie record",
  },
  {
    id: "LS-04",
    family: "F13",
    type: "sql",
    name: "Duplicate SITS codes across tenancies (cross-contamination)",
    description:
      "Student or enrolment codes that appear in multiple tenant partitions. Indicates cross-tenancy data contamination from a prior multi-tenant SITS deployment or SITS shared-service environment. Critical migration blocker.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-6.1",
    tags: ["legacy-scar", "multi-tenant", "migration", "sits"],
    enabledByDefault: true,
    sql: `SELECT STU_CODE AS subject_id, COUNT(DISTINCT STU_TENT) AS tenant_count
           FROM STU
          GROUP BY STU_CODE
         HAVING COUNT(DISTINCT STU_TENT) > 1`,
    messageTemplate:
      "Student code {{subject_id}} exists in {{tenant_count}} tenant partitions — cross-tenancy contamination detected",
  },
  {
    id: "LS-05",
    family: "F13",
    type: "sql",
    name: "Assessment marks from retired grading schemes",
    description:
      "Assessment mark records reference grading scheme codes (SAM_GSCH) that are no longer active in the grade scheme table. Indicates marks recorded under historical grading structures never mapped forward.",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-6.1",
    tags: ["legacy-scar", "assessment", "migration", "sits"],
    enabledByDefault: true,
    sql: `SELECT SAM_CODE AS subject_id, SAM_STUC AS student_id,
                  SAM_GSCH AS grade_scheme, SAM_MARK AS mark
           FROM SAM
          WHERE SAM_GSCH IS NOT NULL
            AND SAM_GSCH NOT IN (
              SELECT GRS_CODE FROM GRS WHERE GRS_TENT = :tenantId AND GRS_ACTV = 'Y'
            )
            AND SAM_TENT = :tenantId`,
    messageTemplate:
      "Assessment mark {{subject_id}} uses retired grading scheme '{{grade_scheme}}' — needs mapping",
  },
  {
    id: "LS-06",
    family: "F13",
    type: "sql",
    name: "Finance records referencing closed academic years",
    description:
      "Fee liability records (SFE) reference academic year codes that are closed and where the financial year has also closed. These cannot be edited in SITS but must be correctly mapped in the target system.",
    severity: "INFO",
    ucisa_benchmark_ref: "UCISA-DM-6.1",
    tags: ["legacy-scar", "finance", "migration", "sits"],
    enabledByDefault: true,
    sql: `SELECT SFE_CODE AS subject_id, SFE_SRSC AS enrolment_id,
                  SFE_AYRC AS academic_year, SFE_AMNT AS amount
           FROM SFE
           JOIN AYR ON AYR_CODE = SFE_AYRC AND AYR_TENT = :tenantId
          WHERE AYR_ENDD < CURRENT_DATE - INTERVAL '3 years'
            AND SFE_TENT = :tenantId`,
    messageTemplate:
      "Finance record {{subject_id}} references academic year {{academic_year}} closed >3 years ago — verify carry-forward mapping",
  },
  {
    id: "LS-07",
    family: "F13",
    type: "llm",
    name: "AI detection of narrative field abuse",
    description:
      "SITS free-text/memo fields (notes, remarks) sometimes contain structured data entered manually because the proper coded field was not available or not understood. AI agent identifies fields where structured data has been entered in narrative form and proposes migration to correct coded fields. Requires human approval for all proposals.",
    severity: "INFO",
    ucisa_benchmark_ref: "UCISA-DM-6.1",
    tags: ["legacy-scar", "ai", "narrative-abuse", "sits"],
    enabledByDefault: false,
    promptTemplate:
      "Analyse the following SITS notes/remarks field values sampled from this institution. Identify any patterns where structured data (dates, codes, categories, names) has been entered in free-text form instead of using the appropriate coded field. For each pattern found, suggest the correct SITS field it should map to:\n\n{{context}}",
    outputSchema: "cleansing-proposal",
  },
  {
    id: "LS-08",
    family: "F13",
    type: "sql",
    name: "Orphaned module occurrences with no parent module",
    description:
      "Module availability (MAV) records where the parent module (MOD) has been deleted but the availability record and any student registrations remain. Classic artefact of module retirement workflows that deleted the module without cascading.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-6.1",
    tags: ["legacy-scar", "migration", "programme-structure", "sits"],
    enabledByDefault: true,
    sql: `SELECT MAV_CODE AS subject_id, MAV_MODC AS module_code
           FROM MAV
          WHERE MAV_MODC NOT IN (SELECT MOD_CODE FROM MOD WHERE MOD_TENT = :tenantId)
            AND MAV_TENT = :tenantId`,
    messageTemplate:
      "Module occurrence {{subject_id}} references deleted module '{{module_code}}' — orphaned record",
  },
];
