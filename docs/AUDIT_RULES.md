# DataBridge Audit Rules Catalogue

69 rules across 13 families. Every rule has a `ucisa_benchmark_ref` field.

## Rule Families

| ID  | Family                                | Rules | Severity range   |
| --- | ------------------------------------- | ----- | ---------------- |
| F01 | Identity & Uniqueness                 | 8     | WARN – CRITICAL  |
| F02 | HESA Code Conformance                 | 12    | WARN – ERROR     |
| F03 | HESA Data Futures Required Fields     | 9     | ERROR – CRITICAL |
| F04 | Referential Integrity (SITS-specific) | 7     | WARN – ERROR     |
| F05 | Enrolment Consistency                 | 6     | WARN – ERROR     |
| F06 | Date Logic                            | 5     | WARN – ERROR     |
| F07 | Fee Status & Nationality Cross-check  | 4     | WARN – ERROR     |
| F08 | Award & Qualification                 | 4     | WARN – ERROR     |
| F09 | Module & Assessment                   | 3     | INFO – WARN      |
| F10 | Statistical Anomaly                   | 4     | INFO – WARN      |
| F11 | Schema Drift                          | 2     | WARN – ERROR     |
| F12 | Legacy Scar Detection                 | 8     | INFO – ERROR     |
| F13 | GDPR / PII Exposure                   | 3     | WARN – CRITICAL  |

## Family F01 — Identity & Uniqueness

| Rule ID | Name                       | Logic                                                            | Severity |
| ------- | -------------------------- | ---------------------------------------------------------------- | -------- |
| F01-01  | Duplicate student number   | `COUNT(*) > 1` on `studentNumber` within tenant                  | CRITICAL |
| F01-02  | Missing surname            | `surname IS NULL OR TRIM(surname) = ''`                          | ERROR    |
| F01-03  | Missing date of birth      | `dob IS NULL` where `studentId IS NOT NULL`                      | WARN     |
| F01-04  | DOB implausible            | `dob < '1900-01-01' OR dob > CURRENT_DATE - interval '10 years'` | ERROR    |
| F01-05  | Duplicate UCAS personal ID | `ucasPersonalId` appears on >1 `Person`                          | ERROR    |
| F01-06  | Missing HESA Student ID    | `hesaStudentId IS NULL` for active enrolments                    | WARN     |
| F01-07  | Student number format      | does not match `^[A-Z0-9]{6,12}$` (configurable per institution) | INFO     |
| F01-08  | Cross-source ID mismatch   | same natural person has conflicting `externalIds` keys           | WARN     |

## Family F02 — HESA Code Conformance

| Rule ID | Name               | Codeset                    |
| ------- | ------------------ | -------------------------- |
| F02-01  | Invalid SEXID      | HESA SEXID                 |
| F02-02  | Invalid GENDERID   | HESA GENDERID              |
| F02-03  | Invalid NATION     | HESA NATION                |
| F02-04  | Invalid DOMICILE   | HESA DOMICILE              |
| F02-05  | Invalid ETHNIC     | HESA ETHNIC                |
| F02-06  | Invalid DISABLE    | HESA DISABLE               |
| F02-07  | Invalid QUALENT3   | HESA QUALENT3              |
| F02-08  | Invalid COURSEAIM  | HESA COURSEAIM             |
| F02-09  | Invalid MODE       | HESA STULOAD mode values   |
| F02-10  | Invalid INITIATIVE | HESA INITIATIVE            |
| F02-11  | Invalid HECoS code | HESA HECoS subject codeset |
| F02-12  | Invalid TYPEYR     | HESA TYPEYR                |

## Family F03 — HESA Data Futures Required Fields

| Rule ID | Name                                    | DF Entity             |
| ------- | --------------------------------------- | --------------------- |
| F03-01  | Missing Engagement record               | Engagement            |
| F03-02  | Missing Instance                        | Instance              |
| F03-03  | Missing Module Instance                 | ModuleInstance        |
| F03-04  | Missing Study Location                  | StudyLocation         |
| F03-05  | Missing SES category                    | SES                   |
| F03-06  | Missing Disability record               | Disability            |
| F03-07  | Missing QualificationAwarded            | QualificationAwarded  |
| F03-08  | Missing SupervisorAllocation (doctoral) | SupervisorAllocation  |
| F03-09  | Missing TermtimeAccommodation           | TermtimeAccommodation |

## Family F12 — Legacy Scar Detection (commercially differentiating)

These rules detect residual artefacts from previous system migrations or
manual data corrections that are invisible to standard validation.

| Rule ID | Name                       | Description                                                                  |
| ------- | -------------------------- | ---------------------------------------------------------------------------- |
| F12-01  | Banner PIDM remnant        | `externalIds.bannerPidm` present on records that should be SITS-only         |
| F12-02  | SITS null-padded code      | codes padded with trailing spaces or null chars (`CHAR` vs `VARCHAR2`)       |
| F12-03  | Workday iCal epoch         | dates encoded as Workday iCal epoch integers (not ISO 8601)                  |
| F12-04  | Orphaned UDF data          | `men_udf` decoded values referencing deleted parent entities                 |
| F12-05  | Contradictory HESA history | `HESASTU` history rows contradict current `INS_STU` HESA fields              |
| F12-06  | Cross-migration duplicate  | same person appears under both old and new student number                    |
| F12-07  | Stale enrolment status     | enrolment status unchanged for >730 days with active module registrations    |
| F12-08  | Banner STV orphan          | STV lookup value referenced in student records but absent from `STV*` tables |
