/**
 * Workday Student — native integrity rules.
 *
 * Source: docs/WORKDAY_DATA_STRUCTURES.md §19 ("Audit rule hooks") —
 * the source-native integrity checks the audit engine should support
 * when running against a Workday Student tenant via RaaS reports.
 *
 * Unlike SITS/Banner (Oracle SQL), Workday is interrogated via RaaS
 * report endpoints returning JSON. These rules are still modelled as
 * SqlAuditRule entries for taxonomic parity with the other native
 * packs — the "sql" body documents the conceptual query and is
 * translated by the Workday RaaS executor into the equivalent
 * report-call + JSON-path predicate at runtime.
 *
 * Family: WORKDAY-INTEGRITY.
 */
import type { AuditRule } from "@databridge/rule-core";

export const WORKDAY_NATIVE_RULES: AuditRule[] = [
  // ─── §19.1 — Identity hygiene ────────────────────────────────────────
  {
    id: "WORKDAY-NAT-01",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "Person missing a current legal name (Name_Data)",
    description:
      "Every Person must have at least one Name_Data row with Type='Legal' AND Current=true. Workday allows multiple names; the audit engine requires exactly one current legal name for identity uniqueness.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.1",
    tags: ["workday-native", "identity", "wd.person.current-name-missing"],
    enabledByDefault: true,
    sql: `SELECT p.Worker_ID AS subject_id,
                 p.Preferred_Name AS preferred_name
            FROM Persons p
           WHERE :tenantId IS NOT NULL
             AND NOT EXISTS (
                   SELECT 1
                     FROM Name_Data n
                    WHERE n.Worker_ID = p.Worker_ID
                      AND n.Type      = 'Legal'
                      AND n.Current   = TRUE
                 )`,
    messageTemplate:
      "Worker {{subject_id}} ({{preferred_name}}) has no current legal name (Name_Data Type=Legal, Current=true)",
  },
  {
    id: "WORKDAY-NAT-02",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "Person with multiple Primary=true emails",
    description:
      "Email_Address_Data must contain exactly one row with Primary=true. Multiple primaries cause notification routing ambiguity.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.1",
    tags: ["workday-native", "identity", "wd.person.preferred-email-uniqueness"],
    enabledByDefault: true,
    sql: `SELECT e.Worker_ID AS subject_id,
                 COUNT(*)    AS primary_count
            FROM Email_Address_Data e
           WHERE e.Primary = TRUE
             AND (:tenantId IS NULL OR e.TenantId = :tenantId)
           GROUP BY e.Worker_ID
          HAVING COUNT(*) <> 1`,
    messageTemplate:
      "Worker {{subject_id}} has {{primary_count}} primary email addresses (must be exactly 1)",
  },

  // ─── §19.2 — Programme integrity ─────────────────────────────────────
  {
    id: "WORKDAY-NAT-03",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "Active student with no in-progress programme",
    description:
      "Every Student with Student_Status='Active' must have at least one Program_of_Study_in_Progress with status='In Progress'.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["workday-native", "programme", "wd.programme.no-active-record"],
    enabledByDefault: true,
    sql: `SELECT s.Worker_ID AS subject_id,
                 s.Student_Status AS student_status
            FROM Students s
           WHERE s.Student_Status = 'Active'
             AND NOT EXISTS (
                   SELECT 1
                     FROM Program_of_Study_in_Progress p
                    WHERE p.Worker_ID = s.Worker_ID
                      AND p.Status    = 'In Progress'
                      AND (:tenantId IS NULL OR p.TenantId = :tenantId)
                 )`,
    messageTemplate:
      "Student {{subject_id}} is {{student_status}} with no in-progress programme of study",
  },
  {
    id: "WORKDAY-NAT-04",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "In-progress programme with expected completion in the past",
    description:
      "Program_of_Study_in_Progress.Expected_Completion_Date < today() yet status is still 'In Progress'. Indicates a stale programme that should have been completed or extended.",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["workday-native", "programme", "wd.programme.expected-end-in-past"],
    enabledByDefault: true,
    sql: `SELECT p.Program_Record_ID    AS subject_id,
                 p.Worker_ID             AS worker_id,
                 p.Expected_Completion_Date AS expected_completion
            FROM Program_of_Study_in_Progress p
           WHERE p.Status = 'In Progress'
             AND p.Expected_Completion_Date < CURRENT_DATE
             AND (:tenantId IS NULL OR p.TenantId = :tenantId)`,
    messageTemplate:
      "Programme {{subject_id}} (worker {{worker_id}}) expected to complete {{expected_completion}} is still In Progress",
  },

  // ─── §19.3 — Registration consistency ────────────────────────────────
  {
    id: "WORKDAY-NAT-05",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "In-progress programme with zero registered sections in current period",
    description:
      "Student has an In Progress programme but zero Course_Section rows with status='Registered' in the current Academic Period.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["workday-native", "registration", "wd.registration.zero-credit-load"],
    enabledByDefault: true,
    sql: `SELECT p.Worker_ID    AS subject_id,
                 p.Program_Record_ID AS programme_id,
                 ap.Academic_Period AS academic_period
            FROM Program_of_Study_in_Progress p
            JOIN Academic_Periods ap
              ON ap.Is_Current = TRUE
           WHERE p.Status = 'In Progress'
             AND NOT EXISTS (
                   SELECT 1
                     FROM Course_Section_Registrations r
                    WHERE r.Worker_ID       = p.Worker_ID
                      AND r.Status          = 'Registered'
                      AND r.Academic_Period = ap.Academic_Period
                 )
             AND (:tenantId IS NULL OR p.TenantId = :tenantId)`,
    messageTemplate:
      "Worker {{subject_id}} (programme {{programme_id}}) has In Progress status but no Registered sections in {{academic_period}}",
  },
  {
    id: "WORKDAY-NAT-06",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "Duplicate registration for (Worker, Course_Section)",
    description:
      "Two or more Registered rows for the same (Worker_ID, Course_Section). Workday's BP usually prevents this; surfacing finds accidental support fixes.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["workday-native", "registration", "wd.registration.duplicate-section"],
    enabledByDefault: true,
    sql: `SELECT MIN(r.Registration_ID) AS subject_id,
                 r.Worker_ID            AS worker_id,
                 r.Course_Section       AS course_section,
                 COUNT(*)               AS dup_count
            FROM Course_Section_Registrations r
           WHERE r.Status = 'Registered'
             AND (:tenantId IS NULL OR r.TenantId = :tenantId)
           GROUP BY r.Worker_ID, r.Course_Section
          HAVING COUNT(*) > 1`,
    messageTemplate:
      "Duplicate registration {{subject_id}}: worker {{worker_id}}, section {{course_section}} appears {{dup_count}} times",
  },

  // ─── §19.4 — Marks integrity ─────────────────────────────────────────
  {
    id: "WORKDAY-NAT-07",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "Closed section with no Final_Grade posted",
    description:
      "Course_Section in 'Closed' state with no Final_Grade for an enrolled student. Indicates a grade-roll-up failure or a teaching faculty that hasn't submitted.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.3",
    tags: ["workday-native", "marks", "wd.grade.no-grade-for-completed-section"],
    enabledByDefault: true,
    sql: `SELECT r.Registration_ID AS subject_id,
                 r.Worker_ID        AS worker_id,
                 r.Course_Section   AS course_section
            FROM Course_Section_Registrations r
            JOIN Course_Sections cs ON cs.Course_Section = r.Course_Section
           WHERE cs.Status = 'Closed'
             AND r.Status  = 'Registered'
             AND r.Final_Grade IS NULL
             AND (:tenantId IS NULL OR r.TenantId = :tenantId)`,
    messageTemplate:
      "Registration {{subject_id}} (worker {{worker_id}}, section {{course_section}}) has no Final_Grade but section is Closed",
  },
  {
    id: "WORKDAY-NAT-08",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "Grade components do not sum to 100",
    description:
      "Sum of Grade_Component.Weight for a Course_Section ≠ 100. Invalid grading scheme — final grade computation will be wrong.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.3",
    tags: ["workday-native", "marks", "wd.grade.component-weight-not-100"],
    enabledByDefault: true,
    sql: `SELECT cs.Course_Section   AS subject_id,
                 SUM(gc.Weight)      AS weight_total
            FROM Course_Sections cs
            JOIN Grade_Components gc ON gc.Course_Section = cs.Course_Section
           WHERE (:tenantId IS NULL OR cs.TenantId = :tenantId)
           GROUP BY cs.Course_Section
          HAVING SUM(gc.Weight) <> 100`,
    messageTemplate:
      "Course section {{subject_id}} has grade components summing to {{weight_total}} (must be 100)",
  },

  // ─── §19.5 — Awards integrity ────────────────────────────────────────
  {
    id: "WORKDAY-NAT-09",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "Completed programme with no Credential",
    description:
      "Program_of_Study_in_Progress.status='Completed' but no Credential row for that (Worker, Programme).",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.3",
    tags: ["workday-native", "awards", "wd.award.no-credential-on-completion"],
    enabledByDefault: true,
    sql: `SELECT p.Program_Record_ID AS subject_id,
                 p.Worker_ID          AS worker_id,
                 p.Programme_Code     AS programme_code
            FROM Program_of_Study_in_Progress p
           WHERE p.Status = 'Completed'
             AND NOT EXISTS (
                   SELECT 1
                     FROM Credentials c
                    WHERE c.Worker_ID      = p.Worker_ID
                      AND c.Programme_Code = p.Programme_Code
                 )
             AND (:tenantId IS NULL OR p.TenantId = :tenantId)`,
    messageTemplate:
      "Programme {{subject_id}} (worker {{worker_id}}, code {{programme_code}}) Completed with no Credential",
  },
  {
    id: "WORKDAY-NAT-10",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "UK undergraduate completion missing HESA classification",
    description:
      "On a UK tenant, undergraduate programme marked Completed but Custom_Field HESA_Classification is empty.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.6",
    tags: ["workday-native", "awards", "hesa", "wd.award.hesa-classification-missing"],
    enabledByDefault: true,
    sql: `SELECT p.Program_Record_ID AS subject_id,
                 p.Worker_ID          AS worker_id
            FROM Program_of_Study_in_Progress p
            JOIN Programmes pr ON pr.Programme_Code = p.Programme_Code
            LEFT JOIN Custom_Field_Values cfv
              ON cfv.Object_Type = 'Program_of_Study_in_Progress'
             AND cfv.Object_ID   = p.Program_Record_ID
             AND cfv.Custom_Field_Name = 'HESA_Classification'
           WHERE p.Status = 'Completed'
             AND pr.Level = 'Undergraduate'
             AND (cfv.Value IS NULL OR TRIM(cfv.Value) = '')
             AND (:tenantId IS NULL OR p.TenantId = :tenantId)`,
    messageTemplate:
      "Programme {{subject_id}} (worker {{worker_id}}) Completed UG without HESA_Classification",
  },

  // ─── §19.6 — HESA pack health ────────────────────────────────────────
  {
    id: "WORKDAY-NAT-11",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "Student missing HESA_HUSID custom field",
    description:
      "UK tenants must populate the HESA_HUSID Custom_Field on every Student. Missing values block the HESA submission.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.6",
    tags: ["workday-native", "hesa", "wd.hesa.pack-installed"],
    enabledByDefault: true,
    sql: `SELECT s.Worker_ID AS subject_id
            FROM Students s
            LEFT JOIN Custom_Field_Values cfv
              ON cfv.Object_Type = 'Student'
             AND cfv.Object_ID   = s.Worker_ID
             AND cfv.Custom_Field_Name = 'HESA_HUSID'
           WHERE (cfv.Value IS NULL OR TRIM(cfv.Value) = '')
             AND (:tenantId IS NULL OR s.TenantId = :tenantId)`,
    messageTemplate:
      "Student {{subject_id}} has no HESA_HUSID populated",
  },
  {
    id: "WORKDAY-NAT-12",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "HESA_HUSID is not 13 digits",
    description:
      "HUSID must be exactly 13 decimal digits per HESA specification. Non-conforming values fail the pack-level validator.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.6",
    tags: ["workday-native", "hesa", "wd.hesa.husid-format"],
    enabledByDefault: true,
    sql: `SELECT cfv.Object_ID AS subject_id,
                 cfv.Value     AS husid
            FROM Custom_Field_Values cfv
           WHERE cfv.Custom_Field_Name = 'HESA_HUSID'
             AND cfv.Object_Type       = 'Student'
             AND NOT REGEXP_LIKE(cfv.Value, '^[0-9]{13}$')
             AND (:tenantId IS NULL OR cfv.TenantId = :tenantId)`,
    messageTemplate:
      "Student {{subject_id}} HUSID '{{husid}}' is not 13 digits",
  },

  // ─── §19.7 — Business process health ─────────────────────────────────
  {
    id: "WORKDAY-NAT-13",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "Application business process stuck > 14 days",
    description:
      "Application BP step In Progress for more than 14 days. Indicates an unassigned step or a stalled approval.",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-3.4",
    tags: ["workday-native", "bp", "wd.bp.stuck-application"],
    enabledByDefault: true,
    sql: `SELECT bp.BP_Instance_ID AS subject_id,
                 bp.Subject_ID     AS subject_record,
                 bp.Initiated_On   AS initiated_on
            FROM Business_Process_Instances bp
           WHERE bp.BP_Type = 'Application'
             AND bp.Status  = 'In Progress'
             AND bp.Initiated_On < (CURRENT_DATE - 14)
             AND (:tenantId IS NULL OR bp.TenantId = :tenantId)`,
    messageTemplate:
      "BP {{subject_id}} (Application for {{subject_record}}) stuck since {{initiated_on}}",
  },
  {
    id: "WORKDAY-NAT-14",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "Application BP Successful with no Application_Decision",
    description:
      "Business Process marked Successful but Application_Decision is empty — UI shows green but downstream offer letter never generates.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.4",
    tags: ["workday-native", "bp", "wd.bp.completed-with-no-decision"],
    enabledByDefault: true,
    sql: `SELECT bp.BP_Instance_ID AS subject_id,
                 bp.Subject_ID     AS subject_record
            FROM Business_Process_Instances bp
            LEFT JOIN Applications a ON a.Application_ID = bp.Subject_ID
           WHERE bp.BP_Type = 'Application'
             AND bp.Status  = 'Successful'
             AND (a.Application_Decision IS NULL OR TRIM(a.Application_Decision) = '')
             AND (:tenantId IS NULL OR bp.TenantId = :tenantId)`,
    messageTemplate:
      "BP {{subject_id}} (Application {{subject_record}}) Successful but Application_Decision is empty",
  },

  // ─── §19.8 — Finance integration ─────────────────────────────────────
  {
    id: "WORKDAY-NAT-15",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "Active enrolment with no Tuition_Charge for academic year",
    description:
      "Student has an In Progress programme but Workday Student Accounts has zero Tuition_Charge rows for the current academic year — fee assessment did not run.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.5",
    tags: ["workday-native", "finance", "wd.fee.no-assessment-on-active-enrolment"],
    enabledByDefault: true,
    sql: `SELECT p.Worker_ID AS subject_id,
                 p.Program_Record_ID AS programme_id,
                 ap.Academic_Year     AS academic_year
            FROM Program_of_Study_in_Progress p
            JOIN Academic_Periods ap ON ap.Is_Current = TRUE
           WHERE p.Status = 'In Progress'
             AND NOT EXISTS (
                   SELECT 1
                     FROM Tuition_Charges tc
                    WHERE tc.Worker_ID     = p.Worker_ID
                      AND tc.Academic_Year = ap.Academic_Year
                 )
             AND (:tenantId IS NULL OR p.TenantId = :tenantId)`,
    messageTemplate:
      "Worker {{subject_id}} (programme {{programme_id}}) has no Tuition_Charge for {{academic_year}}",
  },
  {
    id: "WORKDAY-NAT-16",
    family: "WORKDAY-INTEGRITY",
    type: "sql",
    name: "Cash receipt unallocated > 14 days after posting",
    description:
      "Cash_Receipt posted more than 14 days ago and still not allocated to any charge — student appears unpaid in dunning despite the money being in.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.5",
    tags: ["workday-native", "finance", "wd.fee.unallocated-payment"],
    enabledByDefault: true,
    sql: `SELECT cr.Cash_Receipt_ID AS subject_id,
                 cr.Worker_ID        AS worker_id,
                 cr.Amount           AS amount,
                 cr.Posting_Date     AS posting_date
            FROM Cash_Receipts cr
            LEFT JOIN Receipt_Allocations ra ON ra.Cash_Receipt_ID = cr.Cash_Receipt_ID
           WHERE ra.Cash_Receipt_ID IS NULL
             AND cr.Posting_Date < (CURRENT_DATE - 14)
             AND (:tenantId IS NULL OR cr.TenantId = :tenantId)`,
    messageTemplate:
      "Cash receipt {{subject_id}} (worker {{worker_id}}, {{amount}}, posted {{posting_date}}) unallocated > 14 days",
  },
];
