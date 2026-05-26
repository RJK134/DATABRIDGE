/**
 * Technology One Finance One — native integrity rules.
 *
 * Source: docs/TECHONE_DATA_STRUCTURES.md §19 ("Audit rule hooks") —
 * the source-native integrity checks the audit engine runs directly
 * against an Oracle TechOne Finance One schema (raw T1_* table names),
 * before any canonical extraction.
 *
 * Each rule is a SqlAuditRule executed by the Oracle SQL executor on
 * the TechOne source connection. Most HE TechOne installs are
 * single-tenant, but the `:tenantId` bind is retained for parity with
 * SITS/Banner packs and to allow multi-ledger installs (one row per
 * ledger entity in T1_GL_LEDGER_ENTITY).
 *
 * Family: TECHONE-FIN1-INTEGRITY.
 *
 * Rule IDs follow the namespace TECHONE-FIN1-NN, mirroring SITS-NAT-NN
 * and BANNER-NAT-NN. The dotted spec names from §19 are recorded in
 * each rule's `tags` for cross-reference.
 */
import type { AuditRule } from "@databridge/rule-core";

export const TECHONE_FIN1_NATIVE_RULES: AuditRule[] = [
  // ─── §19.1 — Student-record reconciliation ───────────────────────────
  {
    id: "TECHONE-FIN1-01",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "Orphan student customer (TechOne STU customer with no SIS match)",
    description:
      "Every T1_AR_CUSTOMER row with CustomerTypeCode='STU' must match an active SIS student via the configured SIS-student-number UDF. Orphans indicate a corrupt customer load or stale SIS feed.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["techone-native", "finance", "customer", "techone.financeone.fin1.customer_orphan"],
    enabledByDefault: true,
    sql: `SELECT c.CustomerCode AS subject_id,
                 c.CustomerName  AS customer_name,
                 c.StatusCode    AS status
            FROM T1_AR_CUSTOMER c
            LEFT JOIN sits_student_link l
                   ON l.CustomerCode = c.CustomerCode
                  AND l.TenantId     = :tenantId
           WHERE c.CustomerTypeCode = 'STU'
             AND (l.CustomerCode IS NULL)`,
    messageTemplate:
      "AR Customer {{subject_id}} ({{customer_name}}, status {{status}}) is type STU but has no matching SIS student",
  },
  {
    id: "TECHONE-FIN1-02",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "Withdrawn student still ACTIVE with outstanding balance",
    description:
      "Student withdrawn in SIS but T1_AR_CUSTOMER.StatusCode='ACTIVE' and OutstandingAmount > 0 — will continue to dun a withdrawn learner.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.2",
    tags: ["techone-native", "finance", "customer", "techone.financeone.fin1.customer_status_mismatch"],
    enabledByDefault: true,
    sql: `SELECT c.CustomerCode AS subject_id,
                 c.CustomerName  AS customer_name,
                 SUM(t.OutstandingAmount) AS outstanding
            FROM T1_AR_CUSTOMER c
            JOIN T1_AR_TRANSACTION t
              ON t.CustomerCode = c.CustomerCode
            JOIN sits_student_link l
              ON l.CustomerCode = c.CustomerCode
             AND l.TenantId     = :tenantId
           WHERE c.CustomerTypeCode = 'STU'
             AND c.StatusCode       = 'ACTIVE'
             AND l.SisStatus        = 'WITHDRAWN'
             AND t.OutstandingAmount > 0
           GROUP BY c.CustomerCode, c.CustomerName`,
    messageTemplate:
      "AR Customer {{subject_id}} ({{customer_name}}) is withdrawn in SIS but ACTIVE in TechOne with outstanding {{outstanding}}",
  },

  // ─── §19.2 — Fee assessment integrity ────────────────────────────────
  {
    id: "TECHONE-FIN1-03",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "Interfaced invoice with no SourceReference",
    description:
      "T1_AR_TRANSACTION of type 'INV' carrying SourceSystem != 'MANUAL' but empty SourceReference — invoice cannot be traced back to a SIS fee assessment.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.3",
    tags: ["techone-native", "finance", "invoice", "techone.financeone.fin1.invoice_no_source"],
    enabledByDefault: true,
    sql: `SELECT t.TransactionId     AS subject_id,
                 t.TransactionNumber AS invoice_number,
                 t.CustomerCode      AS customer_code,
                 t.SourceSystem      AS source_system
            FROM T1_AR_TRANSACTION t
           WHERE t.TransactionTypeCode = 'INV'
             AND t.SourceSystem       IS NOT NULL
             AND t.SourceSystem       <> 'MANUAL'
             AND (t.SourceReference IS NULL OR TRIM(t.SourceReference) = '')
             AND (:tenantId IS NULL OR t.TenantId = :tenantId)`,
    messageTemplate:
      "Invoice {{subject_id}} ({{invoice_number}}, customer {{customer_code}}, source {{source_system}}) has no SourceReference",
  },
  {
    id: "TECHONE-FIN1-04",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "Duplicate invoice for same (customer, product, year, term)",
    description:
      "Same (CustomerCode, Product, AcademicYear, TermCode) invoiced twice without an intervening credit-note — likely interface re-run.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.3",
    tags: ["techone-native", "finance", "invoice", "techone.financeone.fin1.duplicate_invoice"],
    enabledByDefault: true,
    sql: `SELECT MIN(t.TransactionId)         AS subject_id,
                 t.CustomerCode                AS customer_code,
                 tl.ProductCode                AS product_code,
                 tl.AcademicYear               AS academic_year,
                 tl.TermCode                   AS term_code,
                 COUNT(*)                      AS invoice_count
            FROM T1_AR_TRANSACTION t
            JOIN T1_AR_TRANSACTION_LINE tl ON tl.TransactionId = t.TransactionId
           WHERE t.TransactionTypeCode = 'INV'
             AND (:tenantId IS NULL OR t.TenantId = :tenantId)
           GROUP BY t.CustomerCode, tl.ProductCode, tl.AcademicYear, tl.TermCode
          HAVING COUNT(*) > 1`,
    messageTemplate:
      "Duplicate invoice {{subject_id}}: customer {{customer_code}}, product {{product_code}}, year {{academic_year}}, term {{term_code}} — {{invoice_count}} invoices",
  },

  // ─── §19.3 — Sponsor / bursary integrity ─────────────────────────────
  {
    id: "TECHONE-FIN1-05",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "Sponsor relationship expired but split still applied",
    description:
      "Invoice posted against a student after the sponsor relationship's EffectiveToDate, yet split logic still attributed a sponsor portion. Almost always indicates the cutover batch did not re-run.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.3",
    tags: ["techone-native", "finance", "sponsor", "techone.financeone.fin1.sponsor_relationship_expired"],
    enabledByDefault: true,
    sql: `SELECT t.TransactionId     AS subject_id,
                 t.TransactionNumber AS invoice_number,
                 t.CustomerCode      AS customer_code,
                 r.SponsorCustomerCode AS sponsor_code,
                 r.EffectiveToDate     AS sponsor_end
            FROM T1_AR_TRANSACTION t
            JOIN T1_AR_CUSTOMER_RELATIONSHIP r
              ON r.CustomerCode = t.CustomerCode
             AND r.RelationshipType = 'SPONSOR'
           WHERE t.TransactionTypeCode = 'INV'
             AND t.SponsorAttributedAmount > 0
             AND r.EffectiveToDate < t.TransactionDate
             AND (:tenantId IS NULL OR t.TenantId = :tenantId)`,
    messageTemplate:
      "Invoice {{subject_id}} ({{invoice_number}}) attributed to sponsor {{sponsor_code}} whose relationship ended {{sponsor_end}}",
  },
  {
    id: "TECHONE-FIN1-06",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "Bursary discount applied without approved workflow",
    description:
      "A T1_AR_DISCOUNT_RULE of type 'BURSARY' applied to an invoice without a matching APPROVED T1_WF_INSTANCE — bypassed approval.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.3",
    tags: ["techone-native", "finance", "bursary", "techone.financeone.fin1.bursary_no_approval"],
    enabledByDefault: true,
    sql: `SELECT t.TransactionId     AS subject_id,
                 t.TransactionNumber AS invoice_number,
                 t.CustomerCode      AS customer_code,
                 d.DiscountCode      AS discount_code,
                 d.DiscountAmount    AS discount_amount
            FROM T1_AR_TRANSACTION t
            JOIN T1_AR_TRANSACTION_DISCOUNT d ON d.TransactionId = t.TransactionId
            LEFT JOIN T1_WF_INSTANCE w
              ON w.SubjectTable = 'T1_AR_TRANSACTION'
             AND w.SubjectKey   = t.TransactionId
             AND w.Status       = 'APPROVED'
           WHERE d.DiscountType = 'BURSARY'
             AND w.InstanceId IS NULL
             AND (:tenantId IS NULL OR t.TenantId = :tenantId)`,
    messageTemplate:
      "Invoice {{subject_id}} ({{invoice_number}}, customer {{customer_code}}) has bursary {{discount_code}} for {{discount_amount}} with no approval workflow",
  },

  // ─── §19.4 — Refund / credit-note integrity ──────────────────────────
  {
    id: "TECHONE-FIN1-07",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "Credit note with no link to originating invoice",
    description:
      "CRN transaction lacking a T1_AR_TRANSACTION_REL row referencing the original invoice — breaks the audit trail.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.3",
    tags: ["techone-native", "finance", "credit-note", "techone.financeone.fin1.credit_note_no_link"],
    enabledByDefault: true,
    sql: `SELECT t.TransactionId     AS subject_id,
                 t.TransactionNumber AS credit_note_number,
                 t.CustomerCode      AS customer_code,
                 t.TotalAmount       AS amount
            FROM T1_AR_TRANSACTION t
            LEFT JOIN T1_AR_TRANSACTION_REL r ON r.ChildTransactionId = t.TransactionId
           WHERE t.TransactionTypeCode = 'CRN'
             AND r.ParentTransactionId IS NULL
             AND (:tenantId IS NULL OR t.TenantId = :tenantId)`,
    messageTemplate:
      "Credit note {{subject_id}} ({{credit_note_number}}, customer {{customer_code}}, {{amount}}) has no link to an originating invoice",
  },
  {
    id: "TECHONE-FIN1-08",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "Segregation-of-duties violation on credit-note workflow",
    description:
      "Same user appears in T1_WF_STEP as both Initiator and Approver on the same credit-note workflow instance.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.4",
    tags: ["techone-native", "finance", "sod", "techone.financeone.fin1.sod_violation"],
    enabledByDefault: true,
    sql: `SELECT s1.InstanceId       AS subject_id,
                 s1.UserCode          AS user_code,
                 t.TransactionNumber  AS credit_note_number,
                 t.TotalAmount        AS amount
            FROM T1_WF_STEP s1
            JOIN T1_WF_STEP s2
              ON s2.InstanceId = s1.InstanceId
             AND s2.UserCode   = s1.UserCode
             AND s1.StepType = 'INITIATE'
             AND s2.StepType = 'APPROVE'
            JOIN T1_WF_INSTANCE w  ON w.InstanceId = s1.InstanceId
            JOIN T1_AR_TRANSACTION t ON t.TransactionId = w.SubjectKey
                                     AND w.SubjectTable = 'T1_AR_TRANSACTION'
           WHERE t.TransactionTypeCode = 'CRN'
             AND (:tenantId IS NULL OR t.TenantId = :tenantId)`,
    messageTemplate:
      "Credit note {{credit_note_number}} ({{amount}}) — user {{user_code}} acted as both initiator and approver on workflow {{subject_id}}",
  },

  // ─── §19.5 — GL coding & tax compliance ──────────────────────────────
  {
    id: "TECHONE-FIN1-09",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "GL posting with invalid chartfield combination",
    description:
      "T1_GL_TRANSACTION line whose (Entity, Account, CostCentre, Project) tuple is not present in T1_GL_VALID_COMBINATION — will land in suspense and block month-end close.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.4",
    tags: ["techone-native", "finance", "gl", "techone.financeone.fin1.invalid_chartfield_combination"],
    enabledByDefault: true,
    sql: `SELECT g.GlTransactionId AS subject_id,
                 g.Entity          AS entity,
                 g.AccountCode     AS account_code,
                 g.CostCentre      AS cost_centre,
                 g.Project         AS project
            FROM T1_GL_TRANSACTION g
            LEFT JOIN T1_GL_VALID_COMBINATION v
              ON v.Entity      = g.Entity
             AND v.AccountCode = g.AccountCode
             AND NVL(v.CostCentre, 'NULL') = NVL(g.CostCentre, 'NULL')
             AND NVL(v.Project,    'NULL') = NVL(g.Project,    'NULL')
           WHERE v.Entity IS NULL
             AND (:tenantId IS NULL OR g.TenantId = :tenantId)`,
    messageTemplate:
      "GL posting {{subject_id}} on ({{entity}}/{{account_code}}/{{cost_centre}}/{{project}}) is not a valid chartfield combination",
  },
  {
    id: "TECHONE-FIN1-10",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "GST/VAT applied to a tax-free tuition product",
    description:
      "Tuition product flagged GST-free / VAT-exempt but the transaction line was posted with a tax code that applied positive tax. AU GSTR 2001/1 / UK HMRC 701/30 breach.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.4",
    tags: ["techone-native", "finance", "tax", "techone.financeone.fin1.tuition_gst_applied"],
    enabledByDefault: true,
    sql: `SELECT t.TransactionId     AS subject_id,
                 t.TransactionNumber AS invoice_number,
                 t.CustomerCode      AS customer_code,
                 tl.ProductCode      AS product_code,
                 tl.TaxAmount        AS tax_amount
            FROM T1_AR_TRANSACTION t
            JOIN T1_AR_TRANSACTION_LINE tl ON tl.TransactionId = t.TransactionId
            JOIN T1_AR_PRODUCT p           ON p.ProductCode    = tl.ProductCode
           WHERE p.TaxClassification = 'TAX_FREE'
             AND tl.TaxAmount > 0
             AND (:tenantId IS NULL OR t.TenantId = :tenantId)`,
    messageTemplate:
      "Invoice {{subject_id}} ({{invoice_number}}) — tax-free product {{product_code}} taxed for {{tax_amount}}",
  },

  // ─── §19.6 — Interface / file-drop health ────────────────────────────
  {
    id: "TECHONE-FIN1-11",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "Staging rows stuck > 4h not promoted",
    description:
      "T1_AR_TRANSACTION_IMPORT_STAGING rows older than 4 hours not yet promoted to T1_AR_TRANSACTION — interface stalled.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.5",
    tags: ["techone-native", "finance", "interface", "techone.financeone.fin1.staging_stuck_rows"],
    enabledByDefault: true,
    sql: `SELECT s.StagingId       AS subject_id,
                 s.SourceSystem    AS source_system,
                 s.SourceReference AS source_reference,
                 s.CreatedAt       AS created_at
            FROM T1_AR_TRANSACTION_IMPORT_STAGING s
           WHERE s.PromotedAt IS NULL
             AND s.CreatedAt < SYSDATE - (4/24)
             AND (:tenantId IS NULL OR s.TenantId = :tenantId)`,
    messageTemplate:
      "Staging row {{subject_id}} (source {{source_system}}/{{source_reference}}, created {{created_at}}) has not been promoted",
  },

  // ─── §19.7 — Foreign-currency handling ───────────────────────────────
  {
    id: "TECHONE-FIN1-12",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "FX rate stale > 1 business day vs posting date",
    description:
      "Foreign-currency invoice posted with an exchange-rate row older than one business day — month-end FX revaluation will misclassify.",
    severity: "ERROR",
    ucisa_benchmark_ref: "UCISA-DM-3.5",
    tags: ["techone-native", "finance", "fx", "techone.financeone.fin1.fx_rate_stale"],
    enabledByDefault: true,
    sql: `SELECT t.TransactionId AS subject_id,
                 t.CurrencyCode  AS currency,
                 t.ExchangeRate  AS rate,
                 r.RateDate      AS rate_date,
                 t.TransactionDate AS posting_date
            FROM T1_AR_TRANSACTION t
            JOIN T1_GL_EXCHANGE_RATE r
              ON r.FromCurrency = t.CurrencyCode
             AND r.ToCurrency   = (SELECT LedgerCurrency
                                     FROM T1_GL_LEDGER_ENTITY
                                    WHERE Entity = t.LedgerEntity)
             AND r.RateDate     = (SELECT MAX(RateDate)
                                     FROM T1_GL_EXCHANGE_RATE r2
                                    WHERE r2.FromCurrency = t.CurrencyCode
                                      AND r2.RateDate <= t.TransactionDate)
           WHERE t.CurrencyCode <> (SELECT LedgerCurrency
                                      FROM T1_GL_LEDGER_ENTITY
                                     WHERE Entity = t.LedgerEntity)
             AND (t.TransactionDate - r.RateDate) > 1
             AND (:tenantId IS NULL OR t.TenantId = :tenantId)`,
    messageTemplate:
      "Transaction {{subject_id}} ({{currency}} @ {{rate}}) posted {{posting_date}} but FX rate dated {{rate_date}}",
  },

  // ─── §19.8 — Census / SLC / TCSI reporting hooks ─────────────────────
  {
    id: "TECHONE-FIN1-13",
    family: "TECHONE-FIN1-INTEGRITY",
    type: "sql",
    name: "Enrolled student at census with no invoiced tuition or sponsor cover",
    description:
      "At census date the student is enrolled in the SIS but TechOne has zero invoiced tuition and no active sponsor or bursary covering tuition — produces a HESA/TCSI reporting hole.",
    severity: "CRITICAL",
    ucisa_benchmark_ref: "UCISA-DM-3.6",
    tags: ["techone-native", "finance", "census", "techone.financeone.fin1.census_outstanding_missing"],
    enabledByDefault: true,
    sql: `SELECT l.CustomerCode AS subject_id,
                 l.SisStudentId AS sis_student_id,
                 l.AcademicYear AS academic_year
            FROM sits_student_link l
           WHERE l.TenantId    = :tenantId
             AND l.SisStatus   = 'ENROLLED'
             AND l.CensusDate IS NOT NULL
             AND NOT EXISTS (
                   SELECT 1
                     FROM T1_AR_TRANSACTION t
                     JOIN T1_AR_TRANSACTION_LINE tl ON tl.TransactionId = t.TransactionId
                    WHERE t.CustomerCode      = l.CustomerCode
                      AND t.TransactionTypeCode = 'INV'
                      AND tl.AcademicYear     = l.AcademicYear
                      AND tl.ProductCategory  = 'TUITION'
                 )
             AND NOT EXISTS (
                   SELECT 1
                     FROM T1_AR_CUSTOMER_RELATIONSHIP r
                    WHERE r.CustomerCode    = l.CustomerCode
                      AND r.RelationshipType = 'SPONSOR'
                      AND r.EffectiveFromDate <= l.CensusDate
                      AND (r.EffectiveToDate IS NULL OR r.EffectiveToDate >= l.CensusDate)
                 )`,
    messageTemplate:
      "Customer {{subject_id}} (SIS {{sis_student_id}}, year {{academic_year}}) enrolled at census but has no tuition invoice or sponsor cover",
  },
];
