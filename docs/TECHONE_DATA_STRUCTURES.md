# Technology One Finance One — Data Structures Reference

> Scope: Australian Technology One (TechnologyOne) Finance One ERP suite as used by
> universities and tertiary providers for **student finance / fees / sponsor billing /
> refunds / GL posting**. This is the AR/Receivables side of a student record system —
> the academic data (programmes, modules, marks, awards) lives in the SIS (SITS,
> Banner, Workday Student, etc.) and is **interfaced** into Finance One via flat files,
> iDoc-style batches, or the TechOne Connect API.
>
> This doc anchors `@databridge/adapter-techone-financeone` scope and gives the audit
> engine concrete entities to reason about. Even where no DataBridge adapter is shipped
> yet, the audit-rule hooks in §19 are pluggable against a TechOne extract.

## Table of contents

1. Architecture
2. Object model & naming
3. The Finance One data dictionary
4. UDFs, attributes, and chartfield extensions
5. Customer master (student as customer)
6. Sponsor & third-party billing
7. Fee structure — products, tariffs, price lists
8. Fee assessment — invoices, debtor transactions
9. Receipts, allocations, refunds & credit notes
10. General ledger posting & chartfields
11. Tax (GST / VAT) handling
12. Foreign currency & multi-currency students
13. Workflow & approvals (Connect-CT, eForms)
14. Interfaces — flat-file, iDoc, TechOne Connect API
15. Reporting — Finance One Analytics, CIA cubes
16. Security & audit
17. UK Student Loans Company / HESRC interface
18. Practical extraction notes — DataPump, CIA, Connect
19. Audit rule hooks (Phase H pattern)

References

---

## 1. Architecture

Finance One is a classic **3-tier on-prem ERP** (often hosted in TechOne's SaaS
"OneEducation" or "Ci Anywhere" cloud, but the data model is the same):

- **Database tier:** Oracle 19c is the predominant deployment in AU/UK higher-ed
  installs. SQL Server is supported but rare in HE. Schema owner is typically `T1`
  or the configured product schema.
- **Application tier:** TechOne Connect (web), Ci Anywhere (modernised UI), and
  legacy Finance One desktop client.
- **Integration tier:** TechOne Connect REST APIs, DataPump (DBA tool), and the
  Common Information Architecture (CIA) reporting layer.

Compared to Banner/SITS/Workday, Finance One is **finance-first** — there is no
native concept of a programme, module, or mark. Students appear as **customers** in
the AR ledger; their fees as **debtor transactions**; refunds as **credit notes**.
Academic context is brought in via the inbound interface from the SIS.

Multi-tenancy in HE deployments is normally a single Finance One instance per
institution; group / collegiate institutions sometimes federate via separate
**ledger entities** within the same database.

## 2. Object model & naming

Finance One uses **3-letter module codes** prefixed on most logical tables and
forms:

| Prefix | Module                                     |
| ------ | ------------------------------------------ |
| `AR`   | Accounts Receivable                        |
| `AP`   | Accounts Payable                           |
| `GL`   | General Ledger                             |
| `PJ`   | Project Ledger                             |
| `FA`   | Fixed Assets                               |
| `PO`   | Purchasing                                 |
| `IN`   | Inventory                                  |
| `HR`   | (Foundation — only if HR/Payroll licensed) |
| `WF`   | Connect workflow                           |

Physical tables on Oracle are typically `T1_<MODULE>_<ENTITY>` (e.g.
`T1_AR_CUSTOMER`, `T1_AR_TRANSACTION`, `T1_GL_ACCOUNT`). Reporting views in CIA
strip the prefix and present **business-friendly** column names (e.g.
`CustomerCode`, `CustomerName`, `OutstandingAmount`).

Identifier shape: Finance One favours **code + name** rather than surrogate IDs —
e.g. customer key is the assigned `CustomerCode` (alphanumeric, often the SIS
student number).

## 3. The Finance One data dictionary

Three places to look:

1. **Ci Anywhere → Settings → Data Dictionary** — exports each module's tables,
   columns, types, lengths, FK relationships. The closest TechOne equivalent of
   SITS' "Run Definitions" or Banner's `gtvsdax`.
2. **CIA Universe definitions** — Common Information Architecture XML files
   describing the analytic views; these are the canonical names for reporting.
3. **TechOne Connect API metadata** — `/v1/metadata/entity/{name}` returns the
   JSON schema for any exposed entity. Use this for DataBridge extraction.

Always pin the dictionary against the customer's **TechOne release** (current GA
is the `2024` stream, with `Ci Anywhere 2024B` the most common HE release).

## 4. UDFs, attributes, and chartfield extensions

Finance One supports two extension mechanisms:

- **User Defined Fields (UDFs)** — per-entity custom columns. Defined in
  `T1_SY_UDF_DEFINITION`, populated in `T1_SY_UDF_VALUE` (EAV-style join on
  `EntityType + EntityKey`). HE customers commonly add `StudentID`,
  `CourseCode`, `AcademicYear`, `IntakeTerm`, `SponsorRef` as UDFs on AR
  Customer and AR Transaction.
- **Chartfield extensions** — extra GL coding segments beyond the standard
  `Entity / Account / CostCentre / Project`. Defined in `T1_GL_SEGMENT_DEFINITION`.

Audit implication: UDFs are **opaque** until you load the definition table.
Adapters MUST inspect `T1_SY_UDF_DEFINITION` to know which UDF carries the
canonical `studentId` mapping — never hard-code column positions.

## 5. Customer master (student as customer)

Core table: `T1_AR_CUSTOMER`.

| Column                | Description                                        |
| --------------------- | -------------------------------------------------- |
| `CustomerCode`        | PK, alphanumeric. Usually the SIS student number.  |
| `CustomerName`        | Display name (LastName, FirstName).                |
| `CustomerTypeCode`    | FK → `T1_AR_CUSTOMER_TYPE`; e.g. `STU`, `SPONSOR`. |
| `StatusCode`          | `ACTIVE`, `INACTIVE`, `ON_HOLD`.                   |
| `CreditLimitAmount`   | Numeric; often 0 for students.                     |
| `PaymentTermsCode`    | FK → `T1_AR_PAYMENT_TERMS`.                        |
| `TaxCode`             | FK → `T1_TX_TAX_CODE`.                             |
| `DefaultCurrencyCode` | ISO 4217.                                          |
| `DateCreated`         | Datetime, system-stamped.                          |
| `DateLastModified`    | Datetime, system-stamped.                          |

Address & contact data is normalised out into `T1_AR_CUSTOMER_ADDRESS` and
`T1_AR_CUSTOMER_CONTACT`. There is no concept of "preferred name" — adapters
should fold preferred name through a UDF if present.

**Mapping note:** in DataBridge canonical Person, `T1_AR_CUSTOMER.CustomerCode`
maps to `studentId` only if (a) it appears in the `STU` customer-type, AND (b)
the configured UDF for SIS-student-number is populated and matches. Customer
codes for **sponsors** (corporate / government bodies) are explicitly excluded.

## 6. Sponsor & third-party billing

Sponsor billing is modelled as a **second customer** plus a billing
relationship:

- `T1_AR_CUSTOMER` with `CustomerTypeCode = 'SPONSOR'` — the company /
  government department.
- `T1_AR_CUSTOMER_RELATIONSHIP` joining a student customer to its sponsor with
  effective dates and a **sponsor percentage** (0–100).
- Outstanding invoices for a sponsored student are split at posting time: the
  sponsor portion is raised against the sponsor customer; the residual against
  the student.

A common audit failure: the sponsor relationship expires mid-year and the
remainder of the year's fees post entirely to the student, generating
unexpected dunning. §19.3 covers the rule.

## 7. Fee structure — products, tariffs, price lists

Fees are modelled as **products** in the AR catalogue:

- `T1_AR_PRODUCT` — fee items: tuition (FT/PT, home/international), bench fees,
  re-sit fees, accommodation, library fines.
- `T1_AR_PRICE_LIST` — per-year, per-product price. Versioned by
  `EffectiveFromDate` / `EffectiveToDate`.
- `T1_AR_DISCOUNT_RULE` — early-payment, scholarship, bursary discounts.

The SIS-side fee calculation (e.g. SITS BIF, Banner TBRACCD, Workday Tuition
Setup) produces a "fee assessment" which is **interfaced in** to Finance One as
an invoice. Finance One does not natively re-derive tuition fees from
enrolment.

## 8. Fee assessment — invoices, debtor transactions

Core table: `T1_AR_TRANSACTION` (one row per debtor line).

| Column                | Description                                         |
| --------------------- | --------------------------------------------------- |
| `TransactionId`       | PK surrogate.                                       |
| `TransactionNumber`   | Human-facing invoice / credit-note number.          |
| `TransactionTypeCode` | `INV`, `CRN` (credit note), `RCT` (receipt), `JNL`. |
| `CustomerCode`        | FK → `T1_AR_CUSTOMER`.                              |
| `TransactionDate`     | Posting date.                                       |
| `DueDate`             | Payment due date.                                   |
| `Amount`              | Net amount (excl. tax).                             |
| `TaxAmount`           | Tax component.                                      |
| `TotalAmount`         | `Amount + TaxAmount`.                               |
| `OutstandingAmount`   | Remaining unpaid; 0 when fully allocated.           |
| `CurrencyCode`        | ISO 4217.                                           |
| `ExchangeRate`        | Rate at posting against ledger currency.            |
| `StatusCode`          | `OPEN`, `PAID`, `WRITTEN_OFF`, `ON_HOLD`.           |
| `SourceSystem`        | Free-text — e.g. `SITS`, `BANNER`, `MANUAL`.        |
| `SourceReference`     | The originating SIS transaction key.                |

Invoice lines live in `T1_AR_TRANSACTION_LINE` with the chartfield split (see
§10). HE customers commonly enable the optional `T1_AR_TRANSACTION_ALLOC`
table for finer receipt-to-invoice allocations (one receipt may pay several
invoices).

## 9. Receipts, allocations, refunds & credit notes

- **Receipts** are `TransactionTypeCode = 'RCT'`. The payment method
  (`PaymentMethodCode`) drives bank-rec; values include `CARD`, `BPAY`, `EFT`,
  `CASH`, `INTERNATIONAL_WIRE`.
- **Allocations** in `T1_AR_TRANSACTION_ALLOC` link receipts to one or more
  invoices.
- **Credit notes** (`CRN`) reverse an invoice. They MUST reference the
  originating `TransactionNumber` via `T1_AR_TRANSACTION_REL`.
- **Refunds** are an AP-side payable raised on the customer, typically
  triggered by a Connect workflow.

Audit-critical invariant: every credit note over a threshold (often AUD 1,000
in AU institutions, GBP 500 in UK installs) MUST have an approval audit-trail
row in `T1_WF_INSTANCE` referencing the credit-note's `TransactionId`.

## 10. General ledger posting & chartfields

Each AR/AP transaction line generates one or more GL postings into
`T1_GL_TRANSACTION` with a chartfield combination:

| Segment      | Typical HE meaning                                |
| ------------ | ------------------------------------------------- |
| `Entity`     | Ledger entity (often `01` main, `02` subsidiary). |
| `Account`    | Income / expense / balance-sheet code.            |
| `CostCentre` | School / faculty / professional service.          |
| `Project`    | Research grant or restricted-fund code.           |
| `Activity`   | Optional analysis code.                           |

The chartfield combination MUST validate against `T1_GL_VALID_COMBINATION`
before posting. Invalid combinations land in a suspense account
(`SUSPENSE-AR`, configurable) and BLOCK month-end close.

## 11. Tax (GST / VAT) handling

- AU installs use GST at 10% on most commercial fees; tuition for accredited
  courses is GST-free (input-taxed). Tax codes in `T1_TX_TAX_CODE`.
- UK installs configure equivalent VAT codes; most tuition is VAT-exempt under
  HMRC Notice 701/30. International student tuition is outside the scope of UK
  VAT.
- Tax determination occurs at transaction-line level using
  `T1_TX_DETERMINATION_RULE` matching on product + customer-country +
  ledger-entity. Mis-coded tuition (GST-applied on a GST-free fee) is a
  reportable finding.

## 12. Foreign currency & multi-currency students

- Students with `DefaultCurrencyCode` ≠ ledger currency raise invoices in their
  preferred currency.
- Exchange rate is taken from `T1_GL_EXCHANGE_RATE` at posting date; outstanding
  balance is **revalued** by the FX-revaluation batch at month end and the
  difference posted to the FX gain/loss account.
- Common error: a foreign student's receipt arrives at a different rate than
  the invoice; allocation produces a small residual that is mis-classified as
  outstanding rather than as FX variance. §19.7.

## 13. Workflow & approvals (Connect-CT, eForms)

TechOne Connect's workflow engine ("CT" — Connect Tasks) is the approval layer
for write-back actions:

- `T1_WF_INSTANCE` — one row per running / completed workflow instance.
- `T1_WF_STEP` — step-level audit; who actioned, when, with what comment.
- `T1_WF_DEFINITION` — the workflow templates.

Common HE workflows: credit-note approval, refund approval, write-off approval,
sponsor-relationship change, fee waiver / hardship grant.

## 14. Interfaces — flat-file, iDoc, TechOne Connect API

Three inbound interface patterns from the SIS:

1. **Flat-file / CSV import** — the historical default. A scheduled batch picks
   up files from a configured drop directory and imports through
   `T1_AR_TRANSACTION_IMPORT_STAGING`. Errors land in
   `T1_AR_TRANSACTION_IMPORT_ERROR`. Adapter pattern: poll the staging tables
   for stuck rows older than N hours.
2. **TechOne DataPump (iDoc-style)** — TechOne's own batch loader. Reads
   `.dat` files keyed to an interface definition. Same staging/error pattern.
3. **TechOne Connect REST API** — modern integration. Endpoints under
   `/connect/api/v1/financials/transactions`. Idempotency key required; rate
   limits apply (1000/min/instance in most HE deployments).

DataBridge's `@databridge/adapter-techone-financeone` (future) targets API #3
preferentially, with the staging-table pattern as a fallback for older
installs.

## 15. Reporting — Finance One Analytics, CIA cubes

- **CIA (Common Information Architecture)** — the canonical reporting layer.
  Defines analytic views like `FactARTransaction`, `DimCustomer`, `DimProduct`,
  `DimChartfield`. Cube refresh is nightly.
- **Finance One Analytics** — TechOne's BI front-end on CIA.
- DataBridge adapters SHOULD read from CIA views rather than the raw OLTP
  tables wherever possible — naming is stable across releases.

## 16. Security & audit

- Application-level: roles in `T1_SY_ROLE`, assigned to users in
  `T1_SY_USER_ROLE`. Permissions are at the **action** level (Post Receipt,
  Issue Credit Note, etc.).
- Field-level audit: `T1_SY_AUDIT_LOG` captures before/after on configured
  sensitive fields. Most HE installs audit `T1_AR_CUSTOMER.CustomerCode`,
  `T1_AR_TRANSACTION.Amount`, and `T1_GL_TRANSACTION.AccountCode`.
- Segregation of duties: enforced via the workflow engine (one user enters,
  another approves). Audit rule §19.4 cross-checks this.

## 17. UK Student Loans Company / HESRC interface

UK HE customers using Finance One run a periodic interface to **HESRC** (Higher
Education Statistics Reporting Common — a synthetic feed combining HESA, OfS,
and SLC reporting). The TechOne extract is:

- A flat-file export of student-level invoiced fees, sponsor amounts, fees
  remitted by SLC, fees outstanding at census date.
- Census dates: 1 December, 1 April, 31 July (UK academic calendar).
- The SLC tuition fee loan amounts must reconcile to the student's invoiced
  tuition for the year — variance over £100 is a HESA-flag (§19.8).

AU equivalents (HELP / FEE-HELP / SA-HELP) post against equivalent receipt
codes (`PAYMENT_METHOD = 'HELP'`) and reconcile via the **TCSI** (Tertiary
Collection of Student Information) submission.

## 18. Practical extraction notes — DataPump, CIA, Connect

For DataBridge to extract from a TechOne instance:

- **Preferred:** TechOne Connect REST API. Bearer-token auth, OAuth2 client
  credentials grant. Use `?filter` and `?fields` aggressively to stay under the
  1000-row-per-page limit. Streams via `?cursor`.
- **Bulk historical:** CIA cube extract via ODBC or Oracle DBLink. Read from
  the `FactAR*` and `DimCustomer` views.
- **Last resort:** direct read from `T1_AR_*` Oracle tables. Requires a
  read-only DB user with grants on the `T1` schema. Avoid in production unless
  CIA refresh latency is unacceptable.

Connect API rate-limit-friendly settings:

- Batch fetch with `pageSize=500` (max 1000), backoff on `429 Too Many Requests`
  to `Retry-After`.
- Use `If-None-Match` ETags on dimension tables (customers, products) — they
  change rarely.

## 19. Audit rule hooks (Phase H pattern)

This section defines the audit-rule surface for Finance One. Each hook is a
`RuleSet` definition that adapters / the operational queue can run against an
extracted TechOne snapshot. Rule IDs are namespaced `techone.financeone.*` and
emit `AuditFinding` records with severity `CRITICAL | ERROR | WARN | INFO`.

### 19.1 Student-record reconciliation (customer-master ↔ SIS)

- `techone.financeone.fin1.customer_orphan` — every `T1_AR_CUSTOMER` row with
  `CustomerTypeCode = 'STU'` MUST match an active SIS student. Orphans (in
  TechOne but not in SIS) raise **ERROR**; the inverse (in SIS but no AR
  customer) raises **CRITICAL** because no fees can be invoiced.
- `techone.financeone.fin1.customer_name_drift` — `CustomerName` MUST equal
  SIS-canonical name within Levenshtein distance 2. **WARN**.
- `techone.financeone.fin1.customer_status_mismatch` — student withdrawn in
  SIS but `T1_AR_CUSTOMER.StatusCode = 'ACTIVE'` and `OutstandingAmount > 0`
  → **ERROR** (will continue to dun a withdrawn student).

### 19.2 Fee assessment integrity

- `techone.financeone.fin1.invoice_no_source` — `T1_AR_TRANSACTION` of type
  `INV` with empty `SourceReference` AND `SourceSystem ≠ 'MANUAL'` →
  **CRITICAL**. An interfaced invoice MUST trace back to a SIS fee
  assessment.
- `techone.financeone.fin1.invoice_amount_drift` — invoiced amount differs
  from the SIS-side fee-assessment value by more than 1.00 in ledger currency
  → **ERROR**.
- `techone.financeone.fin1.duplicate_invoice` — same `(CustomerCode, Product,
AcademicYear, TermCode)` invoiced twice without an intervening credit-note
  → **ERROR**.

### 19.3 Sponsor / bursary integrity

- `techone.financeone.fin1.sponsor_relationship_expired` — invoice posted
  against a student whose sponsor relationship expired before the invoice
  posting date, but split logic still attributed the sponsor portion →
  **CRITICAL** (incorrect billing).
- `techone.financeone.fin1.sponsor_percentage_overshoot` — sum of active
  sponsor percentages > 100 → **ERROR**.
- `techone.financeone.fin1.bursary_no_approval` — fee-waiver discount
  applied (`T1_AR_DISCOUNT_RULE` of type `BURSARY`) without a corresponding
  approved `T1_WF_INSTANCE` → **CRITICAL**.

### 19.4 Refund / credit-note integrity

- `techone.financeone.fin1.credit_note_no_link` — `CRN` transaction without a
  `T1_AR_TRANSACTION_REL` row pointing to the original invoice → **ERROR**.
- `techone.financeone.fin1.credit_note_over_threshold_no_approval` — credit
  note over institutional threshold lacking a `T1_WF_INSTANCE` with
  `Status = 'APPROVED'` → **CRITICAL**.
- `techone.financeone.fin1.refund_to_third_party` — AP refund payee differs
  from the student's `T1_AR_CUSTOMER_CONTACT` payment-instrument owner →
  **ERROR** (potential fraud surface).
- `techone.financeone.fin1.sod_violation` — same user appears in
  `T1_WF_STEP` as both `Initiator` and `Approver` on the same credit-note
  workflow → **CRITICAL**.

### 19.5 GL coding & tax compliance

- `techone.financeone.fin1.invalid_chartfield_combination` — posting line
  with `T1_GL_TRANSACTION.AccountCode` NOT present in
  `T1_GL_VALID_COMBINATION` for the entity → **CRITICAL** (will block close).
- `techone.financeone.fin1.tuition_gst_applied` — GST-applied tax code on a
  tuition-classified product for a GST-free institution → **ERROR**.
- `techone.financeone.fin1.suspense_aged` — line posted to `SUSPENSE-AR`
  outstanding more than 30 days → **WARN**.
- `techone.financeone.fin1.unrealised_fx_drift` — total of unrealised FX
  variance > 0.5% of foreign-currency receivables → **WARN**.

### 19.6 Interface / file-drop health

- `techone.financeone.fin1.staging_stuck_rows` —
  `T1_AR_TRANSACTION_IMPORT_STAGING` rows older than 4 hours not yet promoted
  → **ERROR**.
- `techone.financeone.fin1.import_error_unattended` —
  `T1_AR_TRANSACTION_IMPORT_ERROR` rows older than 24 hours with
  `ResolutionStatus = NULL` → **ERROR**.
- `techone.financeone.fin1.interface_silence` — no inbound SIS-tagged
  invoice for any active enrolled student term within 14 days of term start
  → **CRITICAL** (interface likely broken).

### 19.7 Foreign-currency handling

- `techone.financeone.fin1.fx_rate_stale` —
  `T1_GL_EXCHANGE_RATE.RateDate` lags posting date by > 1 business day →
  **ERROR**.
- `techone.financeone.fin1.fx_residual_misclassified` — receipt
  allocated to invoice in foreign currency producing residual <
  AUD/GBP 1.00 BUT residual posted to `OutstandingAmount` instead of FX
  variance → **WARN**.
- `techone.financeone.fin1.preferred_currency_mismatch` — student
  `DefaultCurrencyCode` differs from invoice `CurrencyCode` → **WARN**.

### 19.8 HESRC / TCSI / Student-Loans reporting hooks

- `techone.financeone.fin1.slc_loan_variance` (UK) — `(SLC tuition loan
amount for student/year) - (tuition invoiced for student/year)` >
  £100 in absolute value → **ERROR**, surface in HESA census pack.
- `techone.financeone.fin1.help_balance_mismatch` (AU) — TCSI-reportable
  HELP balance ≠ sum of `T1_AR_TRANSACTION` HELP receipts year-to-date →
  **ERROR**.
- `techone.financeone.fin1.census_outstanding_missing` — at census date a
  student is enrolled in the SIS but has zero invoiced tuition AND no
  sponsor / bursary covering tuition → **CRITICAL** (will produce a
  HESA/TCSI reporting hole).
- `techone.financeone.fin1.census_pack_missing_fields` — at HESA / TCSI
  pack-build time, required Finance One fields (`CustomerCode`,
  `SourceReference`, `AcademicYear`, `Amount`, `CurrencyCode`) missing on
  more than 0.5% of in-scope rows → **CRITICAL**.

Each rule emits an `AuditFinding` with:

- `entityType` ∈ `{customer, invoice, credit_note, gl_posting, workflow, interface, fx, census}`
- `surface` ∈ `{finance, admissions, programmes, enrolments, results, awards, visa, other}` — for TechOne the predominant surface is `finance`; census-pack rules also surface to `programmes`/`enrolments` for triage.
- `ruleProvenance.binds` populated with the keys above (e.g. `TransactionId`, `CustomerCode`, `AcademicYear`).

The `@databridge/severity-by-surface` aggregator (Phase K3) already routes
`finance.*` rule patterns to the `finance` surface — TechOne findings will
aggregate cleanly without bespoke wiring.

---

## References

- Technology One — Finance One Configuration Guide (2024 release)
- Technology One — Connect REST API Reference (v1, 2024B)
- Technology One — CIA Universe Reference, Finance One
- HESA — Student Finance Data Specification (UK)
- TCSI — Tertiary Collection of Student Information (AU, dese.gov.au)
- HMRC Notice 701/30 — Education and vocational training (UK VAT)
- AU GSTR 2001/1 — GST and the supply of education courses
- DataBridge internal: `docs/AUDIT_RULES.md`, `packages/audit-engine`,
  `packages/severity-by-surface`
