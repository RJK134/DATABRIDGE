# Workday Student — Data Structures Reference

Phase L2 — companion to `SITS_DATA_STRUCTURES.md` and
`BANNER_DATA_STRUCTURES.md`. Anchors the scope of the
`adapter-workday-raas` package and feeds the Phase H audit-rule pattern
for Workday-native checks. Where SITS and Banner are SQL-on-Oracle
worlds, Workday Student is an object-graph behind a SOAP/REST gateway —
this document explains what that means for an integrator and a data
auditor.

## Table of contents

1. Architecture
2. Object model and naming
3. The Workday data dictionary (object, field, web-service)
4. Custom Objects (the Workday equivalent of UDFs)
5. Person / Worker / Student
6. Admissions
7. Academic Foundation (catalog, programs, units)
8. Student Records (programmes, enrolments, registration)
9. Course offering & section enrolment
10. Marks, grades, & academic progress
11. Awards & credentials
12. Research students
13. Finance / Student Accounts
14. Business processes (workflow)
15. Notifications & communications
16. Security & audit
17. UK regulatory reporting (HESA/HESA Data Futures)
18. Practical extraction notes — RaaS, web services, EIBs
19. Audit rule hooks (Phase H pattern)

## 1. Architecture

Workday Student is **not** a relational database — it is an in-memory
object graph behind a deployment of the Workday platform. There is no
direct database to query; integrators interact through:

- **SOAP web services** (`Student_Records_Service`,
  `Student_Recruiting_Service`, `Academic_Foundation_Service`, etc.)
- **REST APIs** (newer surface, smaller coverage as of 2024.x)
- **Reports-as-a-Service (RaaS)** — _the_ mechanism DataBridge uses
  most. Authors build a Workday report in the tenant, mark it
  "Web Service Enabled", and call it as a parametrised endpoint.
- **EIB (Enterprise Interface Builder)** — bulk inbound/outbound flat
  files.
- **Workday Studio** — heavy-weight ETL with branching logic.

`adapter-workday-raas` targets the **RaaS** path because it is:

- Tenant-administered (no Workday Solutions engagement required)
- Versionable (the report XML lives in the tenant; we just call it)
- Predictable (fixed columns, named parameters)

The trade-off is that the _adapter cannot read raw fields outside of a
configured report_. This is why the DataBridge profile catalogue ships
report-XML templates the institution imports into Workday before the
adapter can fetch anything.

## 2. Object model and naming

| Layer                      | Workday name                                                    | DataBridge canonical                |
| -------------------------- | --------------------------------------------------------------- | ----------------------------------- |
| Person container           | `Worker` (employees) + `Student` (learners; sub-type of Person) | `Person`                            |
| Programme                  | `Program of Study`                                              | `ProgrammeEnrolment`                |
| Course catalog item        | `Course Definition`                                             | `Module` (catalog)                  |
| Course offering for a term | `Course Section`                                                | `ModuleInstance`                    |
| Enrolment in a section     | `Course Registration`                                           | `ModuleEnrolment`                   |
| Mark                       | `Grade` (final) + `Grade Component` (component)                 | `ModuleResult` + `AssessmentResult` |
| Award                      | `Credential`                                                    | `Award`                             |
| Admissions record          | `Application` (with `Application Source`, `Stage`)              | `Application`                       |

Workday IDs use **WID** (32-char GUID) as the absolute object reference
and a human-readable **Reference ID** the customer configures. The
adapter must carry both because:

- WID never changes — safe foreign key, but opaque to humans.
- Reference ID is what the institution staff actually use to find the
  record in the UI; without it, all support conversations are blind.

## 3. The Workday data dictionary

There is no `INFORMATION_SCHEMA`. The closest equivalents are:

- **Object Management** — the catalog of all object types in the tenant.
- **Web Services Directory** — every SOAP/REST endpoint with WSDL and
  schema.
- **Reports** — the catalog of pre-built and custom reports, each with
  a stable name and a parameter list.

DataBridge's discovery flow against Workday is therefore:

1. Read the configured RaaS report names from the adapter profile.
2. Fetch the report's XSD via `Get_Web_Services` for the report's
   `Custom_Report` service definition.
3. Cross-reference with the field index in the corresponding
   `docs/WORKDAY_REPORT_SPECS.md` (see audit hooks at §19).

## 4. Custom Objects (UDF analogue)

Workday supports first-class **Custom Objects** and **Custom Fields**
on stock objects. Both are integration-visible: they appear in Object
Management and are addressable in reports. Two important differences
from SITS UDFs and Banner GTVSDAX:

- Custom Fields can have **business rules** that derive their value at
  query time. The adapter cannot tell from the field alone whether a
  null is "no value" or "rule didn't fire" — the audit pack must
  consult the rule.
- Custom Objects are **first-class instances**, not row attributes.
  When a UK institution adds, say, "HESA Cohort", that is a Custom
  Object hung off `Student`, not a column on `Student`.

This is why the Workday audit pack treats absence-of-data with more
care than the SITS one does.

## 5. Person / Worker / Student

| Canonical field         | Workday object / field                                          | Notes                             |
| ----------------------- | --------------------------------------------------------------- | --------------------------------- |
| `id`                    | `WID` (Student object)                                          | Stable, opaque                    |
| `publicId`              | `Universal_Identifier` (Reference ID)                           | Human-readable                    |
| `husid`                 | `Custom_Field`: `HESA_HUSID` (institution-installed)            | UK-only                           |
| `surname`               | `Person_Name_Detail_Data → Last_Name`                           | Latest active row                 |
| `firstName`             | `Person_Name_Detail_Data → First_Name`                          | —                                 |
| `middleName`            | `Person_Name_Detail_Data → Middle_Name`                         | —                                 |
| `title`                 | `Person_Name_Detail_Data → Title`                               | —                                 |
| `dateOfBirth`           | `Personal_Information_Data → Date_Of_Birth`                     | —                                 |
| `legalSex`              | `Personal_Information_Data → Gender`                            | Workday emits Reference ID values |
| `genderIdentity`        | `Custom_Field`: `Gender_Identity`                               | Institution-installed             |
| `nationality`           | `Citizenship` collection (primary)                              | Multi-valued                      |
| `domicile`              | derived from `Home_Address.Country`                             | —                                 |
| `ethnicity`             | `Ethnicity` (US schema) + `Custom_Field`: `HESA_ETHNICITY` (UK) | —                                 |
| `disability`            | `Self_Identified_Disability`                                    | —                                 |
| `primaryEmail`          | `Email_Address_Data` where `Usage_Type = Home`                  | —                                 |
| `currentMailingAddress` | `Address_Data` where `Usage = Mailing, Current = true`          | —                                 |
| `permanentHomeAddress`  | `Address_Data` where `Usage = Home`                             | —                                 |
| `mobilePhone`           | `Phone_Data` where `Type = Mobile`                              | —                                 |
| `dateOfDeath`           | not native — custom field if needed                             | —                                 |

**Gotcha:** Workday returns multi-value collections as repeating XML
elements. The adapter must select the "current" element either by
`Effective_Date <= today < End_Date` or by `Primary = true` depending on
the field. The audit pack ships `current-row-selection-mismatch` checks
for this.

## 6. Admissions

Admissions in Workday Student is the `Application` business object
managed by `Student_Recruiting_Service`.

| Canonical field     | Workday                               | Notes                             |
| ------------------- | ------------------------------------- | --------------------------------- |
| `applicationNumber` | `Application_Reference_ID`            | —                                 |
| `entryTerm`         | `Academic_Period_Reference`           | —                                 |
| `entryYear`         | derived from Academic Period          | —                                 |
| `programmeApplied`  | `Program_of_Study_Reference`          | —                                 |
| `applicationType`   | `Application_Source_Reference`        | "UCAS" must be a configured value |
| `applicationStatus` | `Application_Stage`                   | Workday stage machine             |
| `decision`          | `Application_Decision`                | —                                 |
| `decisionDate`      | `Application_Decision_Date`           | —                                 |
| `applicantResponse` | `Response` (custom in UK tenants)     | —                                 |
| `applicationDate`   | `Submitted_Date`                      | —                                 |
| `feeStatusDeclared` | `Custom_Field`: `Declared_Fee_Status` | UK extension                      |

**Workflow integration**: Admissions decisions in Workday move via a
**Business Process** (BP). The adapter sees only the final state; the
BP audit trail is in `Process_History` and must be fetched separately
to reconstruct timing.

## 7. Academic Foundation

The Workday catalog: `Course Definition`, `Program of Study`,
`Academic Unit`, `Academic Period`.

| Canonical        | Workday                          | Notes                                |
| ---------------- | -------------------------------- | ------------------------------------ |
| `programmeCode`  | `Program_of_Study_Reference_ID`  | —                                    |
| `programmeName`  | `Program_of_Study_Name`          | —                                    |
| `programmeLevel` | `Program_of_Study_Type`          | UG/PGT/PGR                           |
| `moduleCode`     | `Course_Definition_Reference_ID` | —                                    |
| `moduleTitle`    | `Course_Title`                   | —                                    |
| `credits`        | `Course_Definition → Units`      | "Units" = Workday's term for credits |
| `creditsScheme`  | `Units_of_Measure`               | "CATS" for UK tenants                |
| `academicYear`   | `Academic_Year`                  | —                                    |
| `term`           | `Academic_Period_Reference_ID`   | Hierarchy: Year > Session > Term     |

## 8. Student Records — programmes & enrolment

The `Program of Study_in_Progress` object models active enrolment.

| Canonical              | Workday                                         | Notes                                  |
| ---------------------- | ----------------------------------------------- | -------------------------------------- |
| `programmeEnrolmentId` | derived (WID of `Program_of_Study_in_Progress`) | —                                      |
| `personId`             | `Student_Reference` → WID                       | —                                      |
| `programmeId`          | `Program_of_Study_Reference`                    | —                                      |
| `startDate`            | `Started_On`                                    | —                                      |
| `expectedEndDate`      | `Expected_Completion_Date`                      | —                                      |
| `actualEndDate`        | `Completed_On` (when status = Completed)        | —                                      |
| `status`               | `Program_of_Study_in_Progress_Status`           | Active / Withdrawn / Completed / Leave |
| `mode`                 | `Attendance_Type`                               | Full-time / Part-time                  |
| `entryQualification`   | `Custom_Field`: `HESA_QUAL_ON_ENTRY`            | —                                      |
| `award` (intended)     | `Credential_Reference`                          | —                                      |

## 9. Course offering & section enrolment

| Canonical          | Workday                          | Notes                           |
| ------------------ | -------------------------------- | ------------------------------- |
| `moduleInstanceId` | `Course_Section_Reference` (WID) | —                               |
| `academicYear`     | `Academic_Period.Academic_Year`  | —                               |
| `term`             | `Academic_Period_Reference`      | —                               |
| `enrolmentStatus`  | `Registration_Status`            | Registered / Dropped / Withdrew |
| `creditsAttempted` | `Course_Section.Units`           | Workday "Units"                 |
| `gradeMode`        | `Grading_Scheme_Reference`       | —                               |
| `registrationDate` | `Registered_On`                  | —                               |

## 10. Marks, grades, & academic progress

Workday's grade model has **Final Grade** + optional
**Grade Components**. The adapter exposes both.

| Canonical          | Workday                                                   | Notes                      |
| ------------------ | --------------------------------------------------------- | -------------------------- |
| `finalMark`        | `Final_Grade.Numeric_Grade` or `Grade_Reference.Grade_ID` | Numeric when scheme allows |
| `gradeDisplay`     | `Grade_Reference.Grade_Display`                           | —                          |
| `pass`             | derived from `Grade_Reference.Pass_Indicator`             | —                          |
| `creditsAwarded`   | `Final_Grade.Earned_Units`                                | —                          |
| `attempt`          | `Repeat_Indicator`                                        | —                          |
| `gradedDate`       | `Grade_Posted_Date`                                       | —                          |
| `componentCode`    | `Grade_Component.Grade_Component_Reference_ID`            | —                          |
| `componentName`    | `Grade_Component.Grade_Component_Name`                    | —                          |
| `weight`           | `Grade_Component.Weight`                                  | —                          |
| `mark` (component) | `Grade_Component.Grade`                                   | —                          |

## 11. Awards & credentials

| Canonical             | Workday                                        | Notes                             |
| --------------------- | ---------------------------------------------- | --------------------------------- |
| `awardCode`           | `Credential_Reference_ID`                      | —                                 |
| `awardName`           | `Credential_Name`                              | —                                 |
| `status`              | `Credential_Status`                            | Awarded / Anticipated / Withdrawn |
| `conferralDate`       | `Date_Earned`                                  | —                                 |
| `classification` (UK) | `Custom_Field`: `HESA_Classification`          | UK extension                      |
| `gpa` (US)            | `Cumulative_GPA` (snapshot)                    | —                                 |
| `interimFlag`         | derived from `Credential_Status = Anticipated` | —                                 |

## 12. Research students

Workday's research-student fields are largely custom in 2024.x. The
DataBridge profile expects a Custom Object `Research_Student_Profile`
hung off `Student` with fields:

- `Supervisor_1` / `Supervisor_2`
- `Research_Topic`
- `Mode_of_Study` (FT/PT/Distance)
- `Annual_Progression_Status`
- `Thesis_Submission_Date`
- `Viva_Date`

Audit rule §19.5 verifies presence of this Custom Object before
attempting any HESA Student-PGR write.

## 13. Finance / Student Accounts

Student finance in Workday lives in `Student_Accounts`. The adapter
fetches via the `Student_Charge_Adjustment_Service` and related
endpoints. Most UK institutions integrate Workday Student with TechOne
for fees rather than using Workday's native fee module — see L3 doc.

| Canonical         | Workday                          | Notes |
| ----------------- | -------------------------------- | ----- |
| `feeAssessmentId` | `Tuition_Charge_Reference` (WID) | —     |
| `academicYear`    | linked Academic Period           | —     |
| `feeBand`         | `Tuition_Schedule_Reference`     | —     |
| `currency`        | `Currency_Reference`             | —     |
| `amountAssessed`  | `Tuition_Amount`                 | —     |
| `sponsor`         | `Sponsor_Reference`              | —     |

## 14. Business processes (workflow)

Workday's BPs are the most distinctive operational mechanism: every
state change in the system flows through one. For DataBridge:

- Adapters can **read** the current BP state and the history of step
  approvals.
- Adapters must **not initiate** a BP (writes are guarded — only the
  Workday transactional UI / Studio integrations start BPs).
- Audit rules can check for "stuck" BPs older than N days using
  `Process_History → Step_Completion_Status = In Progress`.

## 15. Notifications & communications

Workday's notification framework is internal. Outbound email is
configured per BP step. DataBridge does not surface this; it appears
implicitly in `applicationStatus` transitions.

## 16. Security & audit

Workday tenants have:

- **Domain Security Policies** — coarse-grained access control over
  data domains (Student, Worker, Finance).
- **Business Process Security Policies** — who can initiate/approve a
  BP step.
- **Audit trail** — `Get_Audit_Trail` web service for fine-grained
  change history. The DataBridge identity reconciler uses this to
  detect retroactive PII edits.

## 17. UK regulatory reporting

Workday Student does not ship UK HESA / HESA Data Futures reporting
out of the box. Most UK tenants install a customer-supplied **HESA
Compliance Pack** of Custom Fields and reports. DataBridge looks for
these by Reference ID prefix `HESA_*`. If the pack is not installed,
the adapter's `health-check` endpoint reports it as
`HESA_PACK_MISSING` so the audit profile can refuse to run.

## 18. Practical extraction notes — RaaS, web services, EIBs

**RaaS performance**:

- 5,000-row pages are the sweet spot; larger pages risk gateway
  timeouts (>120s).
- Workday throttles per-tenant — DataBridge respects a 5 req/min
  default and degrades gracefully when 429 returned.
- Reports must be designated `Effective Date` aware; otherwise full
  rebuild on every snapshot fetch is wasteful.

**Web services**:

- SOAP envelopes are verbose; the adapter cache-keys on
  (operation, parameters-hash) and persists XML responses for 24h.
- Pagination uses `Response_Filter` with `Page` and `Count`.

**EIBs**:

- Not used by `adapter-workday-raas`. The companion
  `adapter-workday-eib` (planned) uses EIBs for bulk imports during
  migrations.

## 19. Audit rule hooks (Phase H pattern)

Same shape as `BANNER_DATA_STRUCTURES.md §17` and
`SITS_DATA_STRUCTURES.md §19`. The Workday audit pack ships with the
checks below; the profile bundles them per regulatory regime.

### 19.1 Identity hygiene

- `wd.person.current-name-missing` — at least one `Name_Data` row with
  `Type = Legal, Current = true`.
- `wd.person.preferred-email-uniqueness` — exactly one
  `Email_Address_Data` row with `Primary = true`.

### 19.2 Programme integrity

- `wd.programme.no-active-record` — every `Student` with
  `Student_Status = Active` has at least one
  `Program_of_Study_in_Progress` with status `In Progress`.
- `wd.programme.expected-end-in-past` — `Expected_Completion_Date <
today` and status still `In Progress`.

### 19.3 Registration consistency

- `wd.registration.zero-credit-load` — student with `In Progress`
  programme but zero `Registered` course sections in the current
  Academic Period.
- `wd.registration.duplicate-section` — two `Registered` rows for
  same `(Student, Course_Section)` (Workday usually prevents this;
  surfacing accidental data fixes).

### 19.4 Marks integrity

- `wd.grade.no-grade-for-completed-section` — section in `Closed`
  state with no `Final_Grade` posted.
- `wd.grade.component-weight-not-100` — sum of `Grade_Component.Weight`
  for a section ≠ 100.

### 19.5 Awards integrity

- `wd.award.no-credential-on-completion` — `Program_of_Study_in_Progress
.status = Completed` but no `Credential` row for that programme.
- `wd.award.hesa-classification-missing` — UK tenant, undergraduate
  programme completed, `Custom_Field HESA_Classification` empty.

### 19.6 HESA pack health

- `wd.hesa.pack-installed` — `Custom_Field HESA_HUSID` exists on
  `Student`.
- `wd.hesa.husid-format` — `HESA_HUSID` is 13 digits.

### 19.7 Business process health

- `wd.bp.stuck-application` — `Application` business process step
  `In Progress` for >14 days.
- `wd.bp.completed-with-no-decision` — BP marked `Successful` but
  `Application_Decision` empty.

### 19.8 Finance integration

- `wd.fee.no-assessment-on-active-enrolment` — active programme + zero
  `Tuition_Charge` rows for the academic year.
- `wd.fee.unallocated-payment` — `Cash_Receipt` not allocated to any
  charge after `Posting_Date + 14d`.

---

## References

- Workday Student docs (Community, tenant-bound): "Student Records
  Web Services", "Academic Foundation Setup Guide".
- DataBridge implementation:
  `packages/adapter-workday-raas/src/index.ts`,
  `packages/audit-pack-banner-native` (template for the upcoming
  `audit-pack-workday-native`).
- Cross-reference: `SITS_BANNER_CROSSWALK.md §6–§11` for the canonical
  fields this doc maps Workday to.
