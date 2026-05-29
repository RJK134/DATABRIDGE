# HESA Data Futures — Capability Audit and Required Build

**Date:** 27 May 2026
**Baseline:** v1.4 PR #10 (Phase B merged into the WIP)
**Purpose:** Establish exactly what HESA Data Futures coverage DATABRIDGE has today, what it needs in order to be a credible HESA-returns review and audit tool for any UK HE source system (SITS, Banner, Workday, SJMS, TechOne, plus CRMs), and the build that closes the gap.

This audit is the source-of-truth for the new **Phase HESA-DF** in the revised delivery plan.

---

## 1. What HESA Data Futures actually requires

HESA Data Futures is HESA's restructured statutory data collection (run by Jisc on HESA's behalf since 2023). The relevant statutory streams for a UK HE institution are:

- **Student** — student records (largest stream, ~50 entities, hundreds of fields).
- **Provider** — institution-level metadata.
- **Graduate Outcomes (GOS)** — post-graduation outcomes.
- **AOS (Aggregate Offshore Record)** — non-UK based provision.
- **Staff** — staff records.
- **Estates Management Record (EMR)** — physical estates.
- **Finance** — financial statistics return.

For each stream, an institution must produce:

1. **A submission file** in HESA's XML schema (or JSON for some streams) conforming to the published schema version for the collection year.
2. **Pass HESA Quality Rules** — HESA publishes a downloadable Quality Rules document each cycle (~600-1000 rules per stream, with severities Error/Warning/Info; Errors block submission).
3. **Pass Sign-off Reports** — institution-level summary reports the data owner signs off before submission.
4. **Pass HESA's own validation** — after submission, HESA re-runs server-side validation; failures bounce back as Validation Failure Reports.

The **data quality risk surface** for an institution is therefore four-layered:

1. Source system data quality (SITS/Banner/Workday) → can the source even produce the required fields?
2. Mapping correctness (source → HESA canonical) → are local codes mapped to HESA codesets correctly?
3. Quality Rules compliance → does the resulting return pass HESA's published rules?
4. Sign-off coherence → do the rolled-up totals make sense and reconcile to the previous year?

A tool that claims to support HESA Data Futures must do all four — not just one.

---

## 2. What DATABRIDGE has today

### 2.1 References to HESA in the codebase (audited 27 May 2026)

| Location                                     | What's there                                                                                                                                                                                   | Functional?                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `migrations/sits-to-hesa-tdp/`               | Orchestrator scaffolding, validates only, does NOT write a return. Supports 5 entities (Student, Engagement, Module, Leaver, EntryProfile).                                                    | Partial — validates batches but the `profile-hesa-tdp` package it imports does not exist. |
| `packages/profile-hesa-tdp/`                 | **DOES NOT EXIST.** Referenced in migrations/sits-to-hesa-tdp/package.json but no implementation.                                                                                              | ❌ Phantom dependency.                                                                    |
| `pnpm-workspace.yaml`                        | Declares `profiles/*` glob but the directory itself doesn't exist either.                                                                                                                      | ❌ Phantom glob.                                                                          |
| `packages/dhp-core/`                         | Has tests that reference `profileId: 'hesa-tdp'` and rule IDs `HESA-TDP-001`/`010`/`030` but no actual rules.                                                                                  | Test fixtures only.                                                                       |
| `packages/rule-core/`                        | Comments reference `profile-hesa-tdp's ~40 rules`. Severity model already aligned with HESA (CRITICAL/ERROR/WARN/INFO).                                                                        | Engine ready, no content.                                                                 |
| `packages/canonical/src/entities/student.ts` | Has `hesaUSI` field, `hesaSEXID` field on the canonical Student entity.                                                                                                                        | Partial mapping target.                                                                   |
| `packages/codeset-seeds/`                    | 12 codesets (campus, programme type, mode, level, gender, ethnicity) — **NOT the HESA statutory codesets** (HESA.SEXID, HESA.MODE, HESA.ETHNIC, HESA.NATION etc.).                             | Wrong codesets.                                                                           |
| All audit packs                              | Zero HESA-native rules. Existing native packs are source-system-native (SITS-NATIVE, BANNER-NATIVE, WORKDAY-INTEGRITY, TECHONE-FIN1-INTEGRITY, SALESFORCE-EDU-NATIVE, DYNAMICS365-EDU-NATIVE). | ❌ No HESA pack.                                                                          |
| Returns generators                           | None.                                                                                                                                                                                          | ❌ Missing.                                                                               |
| Sign-off reports                             | None.                                                                                                                                                                                          | ❌ Missing.                                                                               |
| Submission file emitters (XML/JSON)          | None.                                                                                                                                                                                          | ❌ Missing.                                                                               |

### 2.2 The honest summary

DATABRIDGE today can:

- Sample / stream / dictionary / codelist any UK HE source system.
- Run source-native data quality audits (49 rules across SITS/Banner/Workday/TechOne, plus 16 CRM rules).
- Reconcile identity across systems.
- Run parallel-run verification on a `sits → hesa-tdp` _migration_ (without writing anything).

DATABRIDGE today **cannot**:

- Produce a HESA Data Futures Student submission file (XML or JSON).
- Validate a submission against HESA Quality Rules.
- Map non-SITS source systems (Banner, Workday) to the HESA canonical model.
- Generate HESA sign-off reports.
- Detect HESA-impact regressions when a source system changes.
- Maintain HESA codeset currency across collection years.

The "HESA-aware" framing in earlier docs is therefore overstated. A dedicated HESA-DF phase is required.

---

## 3. What "HESA Data Futures complete" means for DATABRIDGE

For DATABRIDGE to credibly support a UK university doing HESA returns review/audit/repair on ANY source system, it must deliver the following stack:

### Layer A — Canonical HESA model (the destination)

Full Pydantic/Zod-typed canonical schema for the HESA Data Futures Student stream (the largest and most-asked-for), then Provider, Staff, EMR, GOS, AOS, Finance in priority order. Each entity must:

- Carry every field of the corresponding HESA published entity, with HESA reference name + type + codeset binding.
- Include effective-dating where HESA requires it (bi-temporal).
- Version-tag for collection year (e.g. `hesa.student.2024-25`).

### Layer B — HESA statutory codesets (the vocabulary)

Statutory HESA codesets shipped as a versioned package. At minimum:

- HESA.SEXID, HESA.GENDERID, HESA.ETHNIC, HESA.NATION, HESA.MODE
- HESA.LEVELQUAL, HESA.COURSEAIM, HESA.FUNDCODE, HESA.DOMICILE
- HESA.SUBJECT (HECoS), HESA.JACS3 (legacy), HESA.FPE, HESA.STULOAD
- HESA.QUALENT3, HESA.SOC (occupation codes via ONS)
- Plus ~20 more per collection year

Each codeset bound to a collection year and refreshable from HESA's published source.

### Layer C — Source→HESA mappers (the translation)

A `hesa-mapper-<source>` package per source system:

- `hesa-mapper-sits` — SITS → HESA canonical
- `hesa-mapper-banner` — Banner → HESA canonical
- `hesa-mapper-workday` — Workday Student → HESA canonical
- `hesa-mapper-sjms` — SJMS5 → HESA canonical

Each emits canonical HESA entities, surfaces unmappable rows as Findings, and uses the existing `schema-mapper` learning loop for operator-driven mapping refinement.

### Layer D — HESA Quality Rules engine (the gate)

Implement HESA's published Quality Rules as runnable Rule objects in a new `audit-pack-hesa-df-student` (initial pack — Student stream). Target: ~150 of the most-failed rules in the first cut, full coverage by v2.0.

- Rule IDs match HESA's published IDs (e.g. `HESA.STUDENT.2024-25.S01001`).
- Severity matches HESA (Error/Warning/Info).
- Rule descriptions and remediation hints lifted verbatim from HESA documentation with citation.

### Layer E — Returns generators (the output)

- `returns-generator-hesa-student-xml` — emits HESA-schema-conforming XML.
- `returns-generator-hesa-student-json` — JSON variant.
- Each generator validates the output against the published HESA XSD/JSON schema before writing.

### Layer F — Sign-off reports (the audit trail)

- Pre-submission summary report: row counts per entity, rule pass/fail counts per severity, year-on-year deltas.
- Post-submission Validation Failure Report parser — ingests HESA's bounce-back and surfaces specific records to fix.
- Sign-off ledger — who signed off what, when, with what waivers.

### Layer G — Repair workflow (the fix loop)

For each failing rule:

- `finding-reproducer` (exists) bisects to the source rows responsible.
- A new `repair-proposer` package emits structured fix proposals back to the source system (SITS Marvin updates, Banner SQL, Workday Studio loads). Read-only proposals in v2.0 — operators apply manually. Write-back is a later phase.

### Layer H — Collection-year management (the calendar)

- HESA Data Futures changes every year (new fields, retired fields, codeset updates). DATABRIDGE must version every artefact by collection year.
- `migration-policy` extended with calendar-aware safeguards: deny migrations during HESA submission windows unless explicitly waivered.
- Watcher cron tracks HESA's published changes from one cycle to the next.

---

## 4. Why this matters for the wider plan

The original Phases C/D/E in the previous delivery plan touched HESA in Phase E only ("UK HE hardening") and underestimated it. HESA Data Futures is the single biggest data-quality job a UK university does each year — it's not a hardening item, it's a feature stream. Promoting it to its own phase (Phase HESA-DF, inserted between Phase C and Phase D) materially improves the product's commercial story for UK HE.

It also makes the LLM work (Phase B) much more useful: HESA Quality Rules are exactly the kind of complex, year-versioned ruleset where NL→rule and narrative findings shine.

---

## 5. Build estimate

| Layer                                                   | Effort    | Cumulative |
| ------------------------------------------------------- | --------- | ---------- |
| A — Canonical HESA model (Student stream)               | 1.5 weeks | 1.5w       |
| B — Statutory codesets (Student stream)                 | 0.5 weeks | 2w         |
| C — Source mappers (SITS, Banner, Workday, SJMS)        | 2 weeks   | 4w         |
| D — Quality Rules engine (~150 rules, Student stream)   | 2 weeks   | 6w         |
| E — Returns generators (XML + JSON, Student stream)     | 1 week    | 7w         |
| F — Sign-off reports + Validation Failure Report parser | 1 week    | 8w         |
| G — Repair workflow (read-only proposals)               | 1 week    | 9w         |
| H — Collection-year management + calendar               | 0.5 weeks | 9.5w       |

**Total: ~10 weeks** for the Student stream end-to-end (the priority stream — ~80% of the value).

Provider, Staff, EMR, GOS, AOS, Finance streams = ~4 weeks each, can be sequenced after the Student stream lands.

---

## 6. Position in the revised plan

The original Phase E becomes "Phase F — final UK HE hardening". A new **Phase HESA-DF** is inserted between Phase C (cloud targets) and Phase D (enterprise ops), because:

- HESA work is product/feature, not platform/ops — should land before enterprise ops hardening.
- A working HESA returns generator is what a university procurement panel actually evaluates.
- Phase D (enterprise ops) makes more sense once the HESA feature surface exists to harden.

See `docs/build-history/02_REVISED_DELIVERY_PLAN.md`.
