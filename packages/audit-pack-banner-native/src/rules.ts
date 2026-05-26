/**
 * Banner native integrity rules.
 *
 * Source: BANNER_DATA_STRUCTURES.md §17 ("Audit rule hooks") — the ten
 * source-native integrity checks the audit engine should support when
 * running directly against an Ellucian Banner Oracle schema (raw Banner
 * table names, not the DataBridge canonical model).
 *
 * Each rule is a SqlAuditRule executed by the Oracle SQL executor on
 * the Banner source connection. Multi-tenant Banner installs are rare;
 * the :tenantId bind is included for parity but defaults to a no-op
 * predicate via OR :tenantId IS NULL where appropriate.
 *
 * Family: BANNER-INTEGRITY.
 */
import type { AuditRule } from "@databridge/rule-core";

export const BANNER_NATIVE_RULES: AuditRule[] = [
  {
    id: "BANNER-NAT-01",
    family: "BANNER-INTEGRITY",
    type: "sql",
    name: "PIDM with no current SPRIDEN row (orphan person)",
    description:
      "Every PIDM referenced by a Banner student record (SGBSTDN) must have a current SPRIDEN row (SPRIDEN_CHANGE_IND IS NULL). Orphan PIDMs indicate a failed name-change merge or corrupt identity import.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["banner-native", "referential-integrity", "person"],
    enabledByDefault: true,
    sql: `SELECT s.sgbstdn_pidm AS subject_id, s.sgbstdn_term_code_eff AS term_code
            FROM sgbstdn s
           WHERE NOT EXISTS (
                   SELECT 1 FROM spriden i
                    WHERE i.spriden_pidm = s.sgbstdn_pidm
                      AND i.spriden_change_ind IS NULL
                 )`,
    messageTemplate:
      "PIDM {{subject_id}} (SGBSTDN term {{term_code}}) has no current SPRIDEN row (orphan)",
  },
  {
    id: "BANNER-NAT-02",
    family: "BANNER-INTEGRITY",
    type: "sql",
    name: "Current SGBSTDN without matching SORLCUR (curriculum gap)",
    description:
      "Each current student record (SGBSTDN with maximum SGBSTDN_TERM_CODE_EFF per PIDM) must have at least one active SORLCUR (learner curriculum) row. Missing curriculum = no programme of study attached.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["banner-native", "referential-integrity", "programme"],
    enabledByDefault: true,
    sql: `SELECT s.sgbstdn_pidm AS subject_id, s.sgbstdn_term_code_eff AS term_code
            FROM sgbstdn s
           WHERE s.sgbstdn_term_code_eff = (
                   SELECT MAX(s2.sgbstdn_term_code_eff)
                     FROM sgbstdn s2
                    WHERE s2.sgbstdn_pidm = s.sgbstdn_pidm
                 )
             AND NOT EXISTS (
                   SELECT 1 FROM sorlcur c
                    WHERE c.sorlcur_pidm = s.sgbstdn_pidm
                      AND c.sorlcur_lmod_code = 'LEARNER'
                      AND (c.sorlcur_end_term IS NULL OR c.sorlcur_end_term > s.sgbstdn_term_code_eff)
                 )`,
    messageTemplate:
      "PIDM {{subject_id}} has current SGBSTDN at term {{term_code}} but no active SORLCUR curriculum row",
  },
  {
    id: "BANNER-NAT-03",
    family: "BANNER-INTEGRITY",
    type: "sql",
    name: "SFRSTCR references CRN whose SSBSECT no longer exists",
    description:
      "Student registration row (SFRSTCR) FKs (term_code, crn) to a section (SSBSECT). Section deletes between terms leave orphan registrations.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["banner-native", "referential-integrity", "registration"],
    enabledByDefault: true,
    sql: `SELECT r.sfrstcr_pidm AS subject_id, r.sfrstcr_crn AS crn, r.sfrstcr_term_code AS term_code
            FROM sfrstcr r
            LEFT JOIN ssbsect s
                   ON s.ssbsect_crn = r.sfrstcr_crn
                  AND s.ssbsect_term_code = r.sfrstcr_term_code
           WHERE s.ssbsect_crn IS NULL`,
    messageTemplate:
      "SFRSTCR for PIDM {{subject_id}} (CRN {{crn}}, term {{term_code}}) references a section that no longer exists in SSBSECT",
  },
  {
    id: "BANNER-NAT-04",
    family: "BANNER-INTEGRITY",
    type: "sql",
    name: "SHRTCKG row with no SHRTCKN parent",
    description:
      "Transcript course grade detail (SHRTCKG) must have a parent transcript course/header row (SHRTCKN) on the same PIDM+TERM+COURSE+SEQ key. Orphan grade detail is irrecoverable for transcript regeneration.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["banner-native", "referential-integrity", "transcript", "assessment"],
    enabledByDefault: true,
    sql: `SELECT g.shrtckg_pidm AS subject_id, g.shrtckg_term_code AS term_code, g.shrtckg_crn AS crn, g.shrtckg_seq_no AS seq_no
            FROM shrtckg g
           WHERE NOT EXISTS (
                   SELECT 1 FROM shrtckn n
                    WHERE n.shrtckn_pidm      = g.shrtckg_pidm
                      AND n.shrtckn_term_code = g.shrtckg_term_code
                      AND n.shrtckn_seq_no    = g.shrtckg_tckn_seq_no
                 )`,
    messageTemplate:
      "SHRTCKG row for PIDM {{subject_id}} (term {{term_code}}, CRN {{crn}}, seq {{seq_no}}) has no parent SHRTCKN row",
  },
  {
    id: "BANNER-NAT-05",
    family: "BANNER-INTEGRITY",
    type: "sql",
    name: "SPBPERS date of birth after SGBSTDN entry date (impossible enrolment)",
    description:
      "If SPBPERS.SPBPERS_BIRTH_DATE is later than SGBSTDN.SGBSTDN_ENTRY_DATE for the same PIDM, the enrolment predates the person's birth — a data-entry or merge error.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.3",
    tags: ["banner-native", "person", "temporal-consistency"],
    enabledByDefault: true,
    sql: `SELECT s.sgbstdn_pidm AS subject_id, p.spbpers_birth_date AS birth_date, s.sgbstdn_entry_date AS entry_date
            FROM sgbstdn s
            JOIN spbpers p ON p.spbpers_pidm = s.sgbstdn_pidm
           WHERE p.spbpers_birth_date IS NOT NULL
             AND s.sgbstdn_entry_date IS NOT NULL
             AND p.spbpers_birth_date > s.sgbstdn_entry_date`,
    messageTemplate:
      "PIDM {{subject_id}} has birth date {{birth_date}} after enrolment entry date {{entry_date}}",
  },
  {
    id: "BANNER-NAT-06",
    family: "BANNER-INTEGRITY",
    type: "sql",
    name: "Active SGBSTDN row with terminal student status code",
    description:
      "Current SGBSTDN row carrying a STVSTST_CODE that is flagged terminal in STVSTST (withdrawn / cancelled / dismissed) should not be treated as active. Flags inconsistent admit-status pipelines.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.3",
    tags: ["banner-native", "status-consistency", "enrolment"],
    enabledByDefault: true,
    sql: `SELECT s.sgbstdn_pidm AS subject_id, s.sgbstdn_stst_code AS status_code, t.stvstst_desc AS status_desc
            FROM sgbstdn s
            JOIN stvstst t ON t.stvstst_code = s.sgbstdn_stst_code
           WHERE s.sgbstdn_term_code_eff = (
                   SELECT MAX(s2.sgbstdn_term_code_eff)
                     FROM sgbstdn s2
                    WHERE s2.sgbstdn_pidm = s.sgbstdn_pidm
                 )
             AND UPPER(t.stvstst_desc) LIKE ANY (ARRAY['%WITHDRAW%', '%CANCEL%', '%DISMISS%', '%TERMINATE%'])`,
    messageTemplate:
      "PIDM {{subject_id}} has current SGBSTDN with terminal status '{{status_code}}' ({{status_desc}})",
  },
  {
    id: "BANNER-NAT-07",
    family: "BANNER-INTEGRITY",
    type: "sql",
    name: "TBRACCD non-zero balance for withdrawn student (write-off candidate)",
    description:
      "Account-receivable detail (TBRACCD) shows a non-zero outstanding balance for a student whose current SGBSTDN status is terminal. Flag for write-off review.",
    severity: "WARN",
    ucisa_benchmark_ref: "UCISA-DM-3.4",
    tags: ["banner-native", "finance", "ar"],
    enabledByDefault: true,
    sql: `SELECT a.tbraccd_pidm AS subject_id, SUM(a.tbraccd_balance) AS outstanding_balance, t.stvstst_desc AS status
            FROM tbraccd a
            JOIN sgbstdn s ON s.sgbstdn_pidm = a.tbraccd_pidm
                          AND s.sgbstdn_term_code_eff = (
                                SELECT MAX(s2.sgbstdn_term_code_eff)
                                  FROM sgbstdn s2
                                 WHERE s2.sgbstdn_pidm = a.tbraccd_pidm
                              )
            JOIN stvstst t ON t.stvstst_code = s.sgbstdn_stst_code
           WHERE UPPER(t.stvstst_desc) LIKE ANY (ARRAY['%WITHDRAW%', '%CANCEL%', '%DISMISS%'])
           GROUP BY a.tbraccd_pidm, t.stvstst_desc
          HAVING SUM(a.tbraccd_balance) <> 0`,
    messageTemplate:
      "PIDM {{subject_id}} carries outstanding balance {{outstanding_balance}} with terminal status '{{status}}'",
  },
  {
    id: "BANNER-NAT-08",
    family: "BANNER-INTEGRITY",
    type: "sql",
    name: "GORVISA expired for active international SGBSTDN (UKVI/SEVIS compliance)",
    description:
      "International student with active SGBSTDN row whose latest GORVISA.GORVISA_VISA_EXPIRE_DATE is in the past breaches UKVI / SEVIS sponsorship reporting duties.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.4",
    tags: ["banner-native", "visa", "compliance", "international"],
    enabledByDefault: true,
    sql: `SELECT v.gorvisa_pidm AS subject_id, v.gorvisa_visa_expire_date AS visa_expiry, v.gorvisa_visa_type AS visa_type
            FROM gorvisa v
            JOIN sgbstdn s ON s.sgbstdn_pidm = v.gorvisa_pidm
                          AND s.sgbstdn_term_code_eff = (
                                SELECT MAX(s2.sgbstdn_term_code_eff)
                                  FROM sgbstdn s2
                                 WHERE s2.sgbstdn_pidm = v.gorvisa_pidm
                              )
            JOIN stvstst t ON t.stvstst_code = s.sgbstdn_stst_code
           WHERE v.gorvisa_visa_expire_date < CURRENT_DATE
             AND UPPER(t.stvstst_desc) NOT LIKE ANY (ARRAY['%WITHDRAW%', '%CANCEL%', '%DISMISS%'])
             AND v.gorvisa_seq_no = (
                   SELECT MAX(v2.gorvisa_seq_no)
                     FROM gorvisa v2
                    WHERE v2.gorvisa_pidm = v.gorvisa_pidm
                 )`,
    messageTemplate:
      "PIDM {{subject_id}} has expired visa ({{visa_type}} expired {{visa_expiry}}) but active student status",
  },
  {
    id: "BANNER-NAT-09",
    family: "BANNER-INTEGRITY",
    type: "sql",
    name: "SARADAP admit decision without subsequent SGBSTDN row",
    description:
      "Admissions application (SARADAP) with an APDC_CODE that admits the applicant should generate an SGBSTDN row for the term they were admitted to. Missing student row = admit-to-enrol leakage.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["banner-native", "admissions", "yield"],
    enabledByDefault: true,
    sql: `SELECT a.saradap_pidm AS subject_id, a.saradap_term_code_entry AS term_code, a.saradap_apdc_code AS decision_code
            FROM saradap a
            JOIN stvapdc d ON d.stvapdc_code = a.saradap_apdc_code
           WHERE d.stvapdc_inst_acc_ind = 'Y'
             AND NOT EXISTS (
                   SELECT 1 FROM sgbstdn s
                    WHERE s.sgbstdn_pidm = a.saradap_pidm
                      AND s.sgbstdn_term_code_eff <= a.saradap_term_code_entry
                 )`,
    messageTemplate:
      "PIDM {{subject_id}} has admit decision '{{decision_code}}' for term {{term_code}} but no SGBSTDN row was ever created",
  },
  {
    id: "BANNER-NAT-10",
    family: "BANNER-INTEGRITY",
    type: "sql",
    name: "SHRDGMR award status set but outcome status date null",
    description:
      "Degree record (SHRDGMR) with DEGS_CODE = 'AW' (awarded) must have OUTCOME_STATUS_DATE populated for HESA classification / progression reporting.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.1",
    tags: ["banner-native", "award", "completeness"],
    enabledByDefault: true,
    sql: `SELECT d.shrdgmr_pidm AS subject_id, d.shrdgmr_degs_code AS degree_status, d.shrdgmr_degc_code AS degree_code
            FROM shrdgmr d
           WHERE d.shrdgmr_degs_code = 'AW'
             AND d.shrdgmr_outcome_status_date IS NULL`,
    messageTemplate:
      "SHRDGMR for PIDM {{subject_id}} (degree {{degree_code}}) shows status '{{degree_status}}' but no outcome status date",
  },
];
