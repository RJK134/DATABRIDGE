# DATABRIDGE — Revised Phased Delivery Plan (with HESA-DF inserted)

**Date:** 27 May 2026
**Supersedes:** `DATABRIDGE_DELIVERY_PLAN.md` (original 5-phase plan)
**Baseline:** v1.4 PR #10 open (DEMO MILESTONE)

## Plan shape — six phases, three milestones

```
NOW (v1.4 DEMO MILESTONE) ──► Phase C (Cloud targets) ──► Phase HESA-DF ──► Phase D ──► Phase E ──► Phase F
                                                                              │                       │
                                                                              ▼                       ▼
                                                              v1.6 ENTERPRISE-INSTALLABLE      v2.0 UK HE COMPLETE
                                                                                                MILESTONE
```

| Phase       | Theme                                                                                                                                          | Duration | Outcome                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------- |
| **C**       | Cloud target adapters — Azure ADF/Synapse/Fabric + Oracle GoldenGate/ADW                                                                       | 8 weeks  | v1.5 — platformable                 |
| **HESA-DF** | HESA Data Futures complete (Student stream) — model, codesets, mappers, Quality Rules, returns generators, sign-off, repair workflow, calendar | 10 weeks | v1.6 — HESA returns-capable         |
| **D**       | Enterprise ops — RBAC, multi-tenancy, SSO, observability, Helm, SOC 2 evidence, pen-test                                                       | 6 weeks  | v1.7 — enterprise-installable       |
| **E**       | UK HE ecosystem hardening — UCAS/Jisc/SLC/TEF connectors, failure-mode controls, HESA returns calendar safeguards                              | 6 weeks  | v1.8 — ecosystem-integrated         |
| **F**       | HESA-DF additional streams — Provider, Staff, EMR, GOS, AOS, Finance — plus pilot conversion                                                   | 8 weeks  | v2.0 — **UK HE COMPLETE MILESTONE** |

Total: **38 calendar weeks** (~9 months) from today to v2.0. The previous plan estimated 30 weeks; the +8 weeks come from properly scoping HESA Data Futures, which the previous plan under-counted.

## Phase C — Cloud target adapters (v1.5, 8 weeks)

(Unchanged from the original plan. See `DATABRIDGE_DELIVERY_PLAN.md` §4 for full detail.)

- C1 Azure family (4w): ADF, Synapse, Azure SQL, Microsoft Fabric.
- C2 Oracle family (4w): GoldenGate, ADW, OCI Data Integration.

**Pre-requisite carry-overs from Phase B:** real ONNX tokeniser/inference, live web E2E test, demo orchestrator auto-launch.

## Phase HESA-DF — HESA Data Futures complete (v1.6, 10 weeks) ⭐ NEW

Full scope and rationale in `docs/build-history/01_HESA_DATA_FUTURES_AUDIT.md`.

### HF1 — Canonical HESA model, Student stream (1.5 weeks)

- `packages/profile-hesa-tdp/` — finally implement the package that's been a phantom dep
- All Student-stream entities with HESA reference names + types + codeset bindings
- Effective-dating on bi-temporal fields
- Collection-year version tags

### HF2 — Statutory codesets, Student stream (0.5 weeks)

- `packages/codeset-seeds-hesa/` — HESA.SEXID, GENDERID, ETHNIC, NATION, MODE, LEVELQUAL, COURSEAIM, FUNDCODE, DOMICILE, SUBJECT (HECoS), JACS3, FPE, STULOAD, QUALENT3, SOC, plus ~20 more
- Each bound to a collection year, refreshable from published source

### HF3 — Source→HESA mappers (2 weeks)

- `packages/hesa-mapper-sits/`
- `packages/hesa-mapper-banner/`
- `packages/hesa-mapper-workday/`
- `packages/hesa-mapper-sjms/`
- Each emits canonical HESA entities, surfaces unmappable rows as Findings, drives the learning loop

### HF4 — Quality Rules engine, Student stream (2 weeks)

- `packages/audit-pack-hesa-df-student/` — ~150 rules in the first cut
- Rule IDs match HESA's published IDs verbatim
- Severity mapping: HESA Error → ERROR (blocks return), Warning → WARN, Info → INFO
- Remediation hints lifted from HESA documentation with citation

### HF5 — Returns generators (1 week)

- `packages/returns-generator-hesa-student-xml/` — HESA-schema-conforming XML
- `packages/returns-generator-hesa-student-json/`
- Each validates against published XSD/JSON schema before writing

### HF6 — Sign-off + Validation Failure Report (1 week)

- Pre-submission summary report
- Post-submission Validation Failure Report parser
- Sign-off ledger (who/what/when/waivers)

### HF7 — Repair workflow (1 week)

- `packages/repair-proposer/` — structured fix proposals (read-only in v1.6)
- Per source system: SITS Marvin update, Banner SQL, Workday Studio load proposals

### HF8 — Collection-year management (0.5 weeks)

- Year-versioned artefacts everywhere
- `migration-policy` calendar-aware safeguard: deny during HESA submission windows
- Watcher cron tracks HESA's annual cycle changes

**Phase HESA-DF exit (v1.6):** a UK university can point DATABRIDGE at their SITS, Banner, Workday, or SJMS source, generate a HESA Data Futures Student-stream submission file, pre-validate it against HESA Quality Rules, produce a sign-off report, submit, parse the Validation Failure Report, and repair the source data. End-to-end HESA returns capability on any major UK HE source system.

## Phase D — Enterprise ops (v1.7, 6 weeks)

(Unchanged from original plan, now numbered v1.7 instead of v1.6.)

- D1 RBAC + multi-tenancy + SSO (2w)
- D2 Observability — OpenTelemetry, Prometheus, Grafana, SLOs (1.5w)
- D3 Packaging — Helm, Terraform, signed images, offline bundle (1.5w)
- D4 Compliance evidence — SOC 2, DPIA, ISO 27001 mapping, external pen-test (1w + procurement)

## Phase E — UK HE ecosystem hardening (v1.8, 6 weeks)

Refined to focus on _ecosystem integration_, not HESA (which is now Phase HESA-DF + F).

### E1 — UK ecosystem connectors (2 weeks)

- `packages/adapter-jisc-learning-analytics/`
- `packages/adapter-ucas/`
- `packages/adapter-slc/` (Student Loans Company HEP Services)
- `packages/adapter-tef-data/`

### E2 — Failure-mode controls (2 weeks)

Each control runnable, not just documentation. Based on the 12-item UK HE transformation failure-mode catalogue in `DATABRIDGE_DELIVERY_PLAN.md` §7:

- Codeset coverage gate
- Effective-dating completeness rules
- Historic-data fidelity check
- Programme/module structural integrity rules
- Cross-system identity ambiguity report
- Returns-impact diff (will this migration change the last submitted HESA return?)
- Returns-calendar collision detection

### E3 — Pilot conversion (1 week)

- Reference customer case study
- Sales collateral, pricing model, SoW template
- 2-day operator training programme

### E4 — Documentation hardening (1 week)

- Customer-facing operator guide
- Admin runbook
- Incident response playbook
- Architecture decision records (ADRs) for the major choices

## Phase F — HESA-DF additional streams + pilot delivery (v2.0, 8 weeks)

### F1 — Provider stream (1 week)

### F2 — Staff stream (1.5 weeks)

### F3 — EMR — Estates Management Record (1 week)

### F4 — Graduate Outcomes (GOS) (1 week)

### F5 — AOS — Aggregate Offshore Record (0.5 weeks)

### F6 — Finance Statistics Return (1.5 weeks)

### F7 — Pilot university delivery in parallel from end of Phase HESA-DF onwards (ongoing)

### F8 — v2.0 release artefacts (1 week)

**Phase F exit (v2.0 — UK HE COMPLETE MILESTONE):**
A UK university can use DATABRIDGE for the full HESA Data Futures cycle across all statutory streams, on any of the major source systems (SITS/Banner/Workday/SJMS), with CRM integration prep (Salesforce/Dynamics), platforming on Azure or Oracle, full enterprise procurement compliance, and a documented operator playbook.

## Definition of done — v2.0 UK HE COMPLETE MILESTONE

A UK university can:

1. Procure DATABRIDGE through standard IT procurement (SSO, DPIA, SOC 2 evidence, Helm, multi-tenant).
2. Deploy in their Azure tenant or OCI tenancy without bespoke engineering.
3. Connect Banner, SITS, Workday, TechOne, Salesforce Education Cloud, Dynamics 365 Education, Jisc, UCAS, SLC — whichever subset they run.
4. Run native + HESA audit packs on day 1.
5. Generate a complete HESA Data Futures cycle: Student + Provider + Staff + EMR + GOS + AOS + Finance.
6. Pre-validate each return against HESA Quality Rules.
7. Use the LLM query bar to interrogate their data in natural language.
8. Plan a Banner↔SITS, SITS↔Workday, or anything↔HESA migration with parallel-run verification.
9. Land the migration on Azure (SQL/Synapse/Fabric) or Oracle (ADW/GoldenGate).
10. Re-run audits during HESA submission windows with calendar-aware safeguards.
11. Repair source-system data based on findings before re-submission.
12. Hand the platform to in-house operators after a 2-day training course.

## Risk register update

| #   | Risk                                                                           | New in this revision? | Mitigation                                                                                                     |
| --- | ------------------------------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| 6   | HESA publishes a schema change mid-Phase HESA-DF                               | Yes                   | Version-pin to a specific collection year; the watcher cron tracks changes; build is collection-year-versioned |
| 7   | Quality Rules document is ambiguous or under-documented                        | Yes                   | Treat first cut as ~80% rule coverage; iterate based on partner-pilot failures                                 |
| 8   | A partner pilot wants a non-priority HESA stream (e.g. Finance) before Phase F | Yes                   | Sequence Phase F streams to follow pilot demand; defer non-pilot streams to v2.1                               |

## Resourcing assumptions (revised)

- 1 engineer (Freddie) full-time with AI assistance — unchanged
- Adding a second engineer at Phase HESA-DF compresses the back half by ~4 weeks
- HESA documentation costs negligible (publicly available)
- External pen-test in Phase D: ~£8-12k
- LLM provider spend in pilot: £100-300/month
- Azure + OCI sandbox subscriptions: ~£200/month combined
