# DATABRIDGE — Phased Delivery Plan

**From:** `cc5d38b` (v1.2 followups merged into PR [#8](https://github.com/RJK134/DATABRIDGE/pull/8)) — pilot-shape product, single migration profile, deterministic suggester, no CRM/cloud-target adapters.
**To:** an enterprise UK HE data interrogation, audit, integration and migration platform — installable on Azure or Oracle, integrating with Salesforce/Dynamics CRMs, with a working LLM-driven review surface, and addressing the most common failure modes of UK HE systems transformations.

**Date:** 26 May 2026
**Author:** Freddie Finn / DATABRIDGE
**Status:** plan-of-record proposal for review

---

## 1. Plan shape — five phases, two milestones

```
NOW ──► Phase A (Demo) ──► Phase B (LLM Review) ──► DEMO MILESTONE
                                                          │
                                                          ▼
        Phase C (Cloud Targets) ──► Phase D (Enterprise Ops) ──► Phase E (UK HE Hardening)
                                                                          │
                                                                          ▼
                                                                ENTERPRISE MILESTONE
```

| Phase | Theme                                                                                                  | Duration | Outcome milestone                             |
| ----- | ------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------- |
| **A** | Demo build: SITS↔Banner migrations + Salesforce + Dynamics CRM adapters                                | 6 weeks  | v1.3 — demoable pilot                         |
| **B** | LLM-driven data review: NL→rule, mapping co-pilot, narrative findings                                  | 4 weeks  | **v1.4 — DEMO MILESTONE** (full demo version) |
| **C** | Cloud target adapters: Azure ADF/Synapse/Fabric + Oracle GoldenGate/ADW                                | 8 weeks  | v1.5 — platformable                           |
| **D** | Enterprise ops: RBAC, multi-tenancy, observability, Helm, SOC 2 evidence                               | 6 weeks  | v1.6 — enterprise-installable                 |
| **E** | UK HE hardening: HESA returns pack, JISC/UCAS connectors, Jisc DPIA pack, common-failure-mode controls | 6 weeks  | **v2.0 — ENTERPRISE MILESTONE**               |

Total: **30 calendar weeks** (~7 months) from today to v2.0, assuming one engineer at full-time pace with AI assistance, two days/week reserved for the partner pilot in parallel from Phase B onwards.

---

## 2. Phase A — Demo build (v1.3, 6 weeks)

**Goal:** stand up the three things a prospective university partner most wants to see in the first hour of a demo: Banner→SITS migration, SITS→Banner migration, and CRM integration prep on both Salesforce and Dynamics.

### 2.1 Workstream A1 — Migration profiles, both directions (2 weeks)

| Deliverable                                | Notes                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations/banner-to-sits`                | Full canonical-via-canonical migration: Banner Oracle/Ethos extract → canonical → SITS loader. Reuses the existing `migration-runner` and `migration-policy`. |
| `migrations/sits-to-banner`                | Symmetric reverse profile.                                                                                                                                    |
| `packages/profile-banner`                  | Banner-side canonical profile; mirror of `profile-sits`.                                                                                                      |
| Identity-reconciler bidirectional config   | Banner PIDM ↔ SITS STU.STUC ↔ canonical PersonId — already exists for one direction; add reverse lookup index.                                                |
| Codeset-mapper rules                       | Banner STVMAJR/STVCAMP ↔ SITS COURSE/INST_CODE — at least 6 codesets each way, sourced from a real published mapping (CASE / Tribal published guidance).      |
| `pre-flight-check` policy for each profile | Deny-on-severity gates, sample-size floor, required-codeset coverage check.                                                                                   |

**Exit gate A1:** dry-run both profiles against synthetic fixtures shipped in the repo; `parallel-run-verifier` reports zero drift on a curated 500-row fixture; CI green.

### 2.2 Workstream A2 — Salesforce Education Cloud adapter (1.5 weeks)

| Deliverable                                 | Notes                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/adapter-salesforce-edu`           | Implements `AdapterSpec`: `sampleRows`, `streamRows`, `getDictionary`, `getCodelists` on top of Salesforce REST + Bulk API 2.0. Bearer-token OAuth client-credentials flow.                                                                |
| `packages/audit-pack-salesforce-edu-native` | 8-10 rules covering the Education Cloud objects most universities use: `hed__Program__c`, `hed__Affiliation__c`, `Contact`, `Account`, `hed__Course_Enrollment__c`. Duplicate-contact, orphan-affiliation, programme-without-course rules. |
| Dictionary                                  | Auto-derived from SObject describe endpoint, cached.                                                                                                                                                                                       |
| Integration-prep report                     | One-page output: "given your SITS/Banner extract, here are the CRM records that would need creating, updating, or rejecting before sync."                                                                                                  |

**Exit gate A2:** unit tests + a recorded HTTP fixture suite (no live Salesforce required to test); adapter contract tests pass.

### 2.3 Workstream A3 — Dynamics 365 Education adapter (1.5 weeks)

| Deliverable                                     | Notes                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `packages/adapter-dynamics365-edu`              | Dataverse Web API; OAuth2 with Azure AD client-credentials.                                                                    |
| `packages/audit-pack-dynamics365-edu-native`    | Mirror Salesforce pack: 8-10 rules over `contact`, `account`, `msdyn_program`, `msdyn_courseinstance`, `msdyn_studentprogram`. |
| Same dictionary + integration-prep report shape | Symmetry with A2 so demo flows identically.                                                                                    |

**Exit gate A3:** same as A2, plus a documented recipe for granting the app a service-principal role in a Microsoft 365 Education tenant.

### 2.4 Workstream A4 — Demo harness (1 week)

| Deliverable                         | Notes                                                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/demo`                         | Scripted end-to-end run: spins up Postgres in Docker, loads fixtures for Banner + SITS + Salesforce + Dynamics, runs all four migrations and CRM reviews, opens browser to results. |
| 4 fixture datasets                  | Synthetic-but-realistic 2-3k-row datasets that each contain seeded data-quality problems matching the most common UK HE issues (see §7).                                            |
| Demo script (`docs/DEMO_SCRIPT.md`) | 45-minute live demo: 10min audit, 10min CRM review, 15min migration parallel-run, 10min Q&A buffer.                                                                                 |

**Phase A exit (v1.3):** PR merged, tag cut, `apps/demo` runs green on a fresh clone in under 10 minutes.

---

## 3. Phase B — LLM data review (v1.4, 4 weeks) — DEMO MILESTONE

**Goal:** make the "AI-driven" claim load-bearing. Three concrete LLM surfaces, none of them speculative.

### 3.1 B1 — Natural-language rule compiler (1.5 weeks)

`packages/rule-compiler-llm`: takes English ("how many 2024/25 entrants have a missing programme of study?") and emits a structured `Rule` against the canonical model. Validates the rule deterministically, runs it, returns findings. Never executes free SQL. The LLM only outputs JSON-schema-constrained rule definitions, which a deterministic compiler then runs — so this is safe-by-construction.

| Deliverable                            | Notes                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| Rule grammar JSON schema               | Strict — only allowed predicates, no string SQL.                                      |
| LLM prompt + schema-constrained output | Provider-agnostic: OpenAI, Anthropic, Azure OpenAI all supported via adapter pattern. |
| Test corpus                            | 50 NL prompts with expected rule output, regression-tested.                           |
| `apps/api` endpoint                    | `POST /v1/rules:compile` → returns rule + dry-run finding count.                      |

### 3.2 B2 — Schema-mapping co-pilot (LLM tie-breaker) (1 week)

Wraps the existing deterministic `SchemaSuggester` and `PostgresLearningStore`. When deterministic confidence is below a threshold, calls an LLM for a tie-breaker **with an explanation**. The deterministic suggester remains the source of truth; the LLM only ranks and explains.

| Deliverable                       | Notes                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `packages/schema-mapper-llm`      | New package; depends on `schema-mapper`.                                      |
| Embedding index over dictionaries | Local sentence-transformers; no external embedding API required.              |
| Explanation surface               | Every LLM suggestion ships with a 2-3 sentence rationale shown in `apps/web`. |
| Audit trail                       | LLM call payload + response stored in `provenance-core`.                      |

### 3.3 B3 — Narrative findings report (1 week)

`packages/findings-narrative-llm`: takes a findings pack and produces a human-readable executive summary ("147 findings, 12 critical, all clustered on the programme-of-study surface, root cause appears to be ..."). Strictly templated — LLM fills slots in a structured template, never freeform.

| Deliverable                | Notes                                 |
| -------------------------- | ------------------------------------- |
| Narrative template grammar | Slot-based.                           |
| Provider adapter           | Same provider-agnostic pattern as B1. |
| `apps/api` endpoint        | `POST /v1/findings/{runId}:narrate`.  |

### 3.4 B4 — Demo polish (0.5 weeks)

| Deliverable          | Notes                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web` query bar | Single input where the demo presenter types NL questions and sees rules-with-findings appear live. |
| Recording            | A 3-minute, 5-minute, and 15-minute pre-recorded demo for sales conversations.                     |

**Phase B exit (v1.4 — DEMO MILESTONE):** end-to-end demo running on a single Azure VM. A presenter can stand in front of a UK university procurement panel and (a) ingest their Banner + SITS samples, (b) ask NL questions of the data, (c) show migration parallel-run in both directions, (d) show CRM integration-prep for both Salesforce and Dynamics, (e) hand them a narrative findings report. **This is the demo version the user asked for.**

---

## 4. Phase C — Cloud target adapters (v1.5, 8 weeks)

**Goal:** land data on the platforms UK universities actually run on. Two cloud families, four target adapters.

### 4.1 C1 — Azure family (4 weeks)

| Deliverable                                | Notes                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `packages/target-adapter-azure-adf`        | Emits Data Factory pipeline JSON for the migration; can also execute it via management API. |
| `packages/target-adapter-azure-synapse`    | Synapse SQL pool loader: COPY INTO from staging blob, polybase optional.                    |
| `packages/target-adapter-azure-sql`        | Azure SQL DB direct loader for smaller universities.                                        |
| `packages/target-adapter-microsoft-fabric` | Fabric Lakehouse + Warehouse loader via OneLake.                                            |
| Shared `azure-auth` package                | Managed identity, service principal, and az-cli local-dev all supported.                    |
| End-to-end test in Azure sandbox           | Real Azure subscription; nightly CI in a sandbox tenant.                                    |

### 4.2 C2 — Oracle family (4 weeks)

| Deliverable                                 | Notes                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/target-adapter-oracle-goldengate` | Emits GG trail files for CDC into ADW or on-prem Oracle.                |
| `packages/target-adapter-oracle-adw`        | Direct loader to Autonomous Data Warehouse via wallet-based connection. |
| `packages/target-adapter-oracle-oci-di`     | OCI Data Integration task definitions.                                  |
| Test fixtures                               | OCI Always-Free tenancy for nightly CI.                                 |

**Phase C exit (v1.5):** every migration profile can land on Postgres (existing), Azure SQL/Synapse/Fabric, or Oracle ADW. Pick-your-target is a config flag on the runner.

---

## 5. Phase D — Enterprise ops (v1.6, 6 weeks)

**Goal:** make DATABRIDGE installable in a university procurement-approved way. This is the unsexy work that decides whether a deal closes.

### 5.1 D1 — RBAC + multi-tenancy (2 weeks)

| Deliverable           | Notes                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/api` RBAC layer | Roles: `viewer`, `auditor`, `mapper`, `migrator`, `admin`. Per-surface and per-finding-class permissions.           |
| Tenant isolation      | Postgres schema-per-tenant; tenant ID propagated through every adapter call.                                        |
| SSO via SAML + OIDC   | Azure AD, Okta, Google Workspace tested.                                                                            |
| Audit log             | Every action (rule run, waiver granted, migration triggered) emitted as a structured event to a tamper-evident log. |

### 5.2 D2 — Observability (1.5 weeks)

| Deliverable                    | Notes                              |
| ------------------------------ | ---------------------------------- |
| OpenTelemetry traces + metrics | Across api, cli, migration-runner. |
| Prometheus endpoint            | `/metrics` on `apps/api`.          |
| Grafana dashboard pack         | Shipped as JSON in `ops/grafana/`. |
| SLO definitions                | Doc'd in `ops/slos.md`.            |

### 5.3 D3 — Packaging (1.5 weeks)

| Deliverable            | Notes                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Helm chart             | `ops/helm/databridge/` — single chart deploys api + web + worker + postgres.               |
| Terraform module       | `ops/terraform/azure/` and `ops/terraform/oci/` — infra-as-code for the two target clouds. |
| Docker images          | Multi-arch; signed with cosign; SBOM attached.                                             |
| Offline install bundle | For air-gapped university environments.                                                    |

### 5.4 D4 — Compliance evidence (1 week)

| Deliverable               | Notes                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| SOC 2 evidence pack       | Control mappings documented; not certification, but the evidence trail an auditor would need. |
| DPIA template             | UK-specific, GDPR-aligned, with sections pre-filled for typical HE data flows.                |
| ISO 27001 control mapping | Documented.                                                                                   |
| Penetration-test report   | Engage an external firm for one round before v2.0.                                            |

**Phase D exit (v1.6):** a university IT department can read the docs, deploy DATABRIDGE in their Azure tenant via Helm, point SSO at their Azure AD, and start running audits — without bespoke engineering support.

---

## 6. Phase E — UK HE hardening (v2.0, 6 weeks) — ENTERPRISE MILESTONE

**Goal:** close the gap between "generic data tool" and "the UK HE tool". Every item here directly addresses a known cause of UK HE transformation failure (see §7).

### 6.1 E1 — HESA & UK regulatory packs (2 weeks)

| Deliverable                              | Notes                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/audit-pack-hesa-data-futures`  | Full Data Futures schema validation, ~80 rules covering Student, Course, Engagement, Entry profile entities. |
| `packages/audit-pack-ucas-applications`  | UCAS Apply data audit pack.                                                                                  |
| `packages/profile-hesa-tdp` enhancements | Effective-dating on all temporal fields, retention policies, suppression rules.                              |
| Returns calendar awareness               | `migration-policy` extension: deny migrations during HESA submission windows unless explicitly waivered.     |

### 6.2 E2 — UK ecosystem connectors (1.5 weeks)

| Deliverable                                | Notes                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `packages/adapter-jisc-learning-analytics` | Jisc LA Service connector.                                                                 |
| `packages/adapter-ucas`                    | UCAS Link adapter for applications/decisions.                                              |
| `packages/adapter-slc`                     | Student Loans Company HEP Services connector (where universities have direct integration). |
| `packages/adapter-tef-data`                | TEF data submission helper.                                                                |

### 6.3 E3 — Common-failure-mode controls (1.5 weeks)

A hardening pack targeting the specific things that go wrong in UK HE transformations. Each control is a runnable check, not just documentation. See §7 for the catalogue these are derived from.

| Control                               | Package / mechanism                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Codeset coverage gate                 | `pre-flight-check` policy: deny migration if codeset mapping <100% of in-use codes.                                      |
| Effective-dating completeness         | New rule family `EFFECTIVE-DATING-NN`.                                                                                   |
| Historic-data fidelity                | `parallel-run-verifier` extended to verify N years of historic enrolments survive the round-trip.                        |
| Programme-modular structure integrity | New rule family `PROGRAMME-STRUCTURE-NN`.                                                                                |
| Cross-system identity ambiguity       | `identity-reconciler` ambiguity report; mandatory triage before migration.                                               |
| Returns-impact diff                   | "Will this migration change your last submitted HESA return?" — runs the rule pack against pre/post canonical and diffs. |

### 6.4 E4 — Partner pilot conversion (1 week)

| Deliverable                   | Notes                                                        |
| ----------------------------- | ------------------------------------------------------------ |
| Reference customer case study | From whichever university pilot completes during Phases B/C. |
| Sales collateral              | Pricing model, statement of work template, support tiers.    |
| Training programme            | 2-day operator training, materials in `docs/training/`.      |

**Phase E exit (v2.0 — ENTERPRISE MILESTONE):** DATABRIDGE is positioned as the UK HE data interrogation, audit, integration-prep, and migration platform. Installable on Azure or Oracle, with CRM integration, LLM-driven review, HESA-aware rules, and a documented playbook for the failure modes that typically kill UK HE transformations.

---

## 7. UK HE transformation failure-mode catalogue (the things v2.0 must address)

This catalogue motivates the controls in §6.3. These are the recurring causes of UK HE systems-transformation failure that the platform must explicitly defend against:

1. **Codeset drift between source and target** — most common cause of post-go-live data fires. Addressed by codeset-coverage gate (E3) and codeset-mapper improvements (A1).
2. **Effective-dating lost in translation** — Banner SAR records, SITS SCE records, and Workday Academic Periods all carry bi-temporal data that vendors handle differently; flattening it loses audit trail. Addressed by `effective-dating` package (already exists) plus completeness rules in E3.
3. **Identity collisions across systems** — same person in Banner under one ID, in SITS under another, in Workday under a third, in the CRM under a fourth. Without explicit reconciliation, the migration silently merges or splits records. Addressed by `identity-reconciler` (exists) plus ambiguity report in E3.
4. **Historic data quietly truncated** — universities discover six months in that their pre-2018 enrolments are gone. Addressed by historic-fidelity check in E3.
5. **Programme/module structural integrity** — programme-with-no-courses, course-with-no-students, missing parent-child links, broken AOS chains. Addressed by structure rule family in E3.
6. **HESA return regression** — the new system can't reproduce the last accepted HESA return. Addressed by returns-impact diff in E3 plus HESA pack in E1.
7. **CRM divergence from system-of-record** — Salesforce/Dynamics drift from SRM because they're written to independently. Addressed by CRM adapters + integration-prep reports (Phase A).
8. **Cloud landing patterns mismatched to in-house ops** — university DBAs are Oracle people, ops team is Azure people, neither owns the end-to-end pipeline. Addressed by dual-cloud target adapters (Phase C).
9. **Procurement-stage stop** — no SSO, no DPIA, no Helm, no SOC 2 evidence — deal dies in IT review. Addressed by Phase D.
10. **Returns-calendar collisions** — migration cutover scheduled across a HESA submission window. Addressed by calendar-aware policy in E1.
11. **Vendor-supplied mapping spreadsheets that nobody validates** — the "mapping document" is treated as truth and never tested. Addressed by `schema-mapper` learning loop (exists) + LLM mapping co-pilot (Phase B).
12. **No reproducible findings** — issues are reported as anecdotes, fixed by emails, never closed in a system. Addressed by `finding-reproducer` + `finding-delta` + `finding-waivers` (exists).

The platform already addresses items 2, 3, 11, 12 by construction. Phases A-E close the remaining items.

---

## 8. Resourcing assumptions

- **1 engineer (Freddie) full-time** with AI assistance — the cadence above assumes this.
- **2 days/week reserved from Phase B onwards** for partner pilot delivery in parallel.
- **External penetration test** in Phase D requires ~£8-12k budget for one round.
- **Azure + OCI sandbox subscriptions** for CI in Phase C — ~£200/month combined.
- **LLM provider spend** in Phase B onwards — usage-based; budget £100-300/month for pilot scale.
- **No additional engineers required to hit v1.4 (DEMO MILESTONE).** Adding one engineer at Phase C compresses Phases C-E from 20 weeks to ~14.

## 9. Risk register (top 5)

| #   | Risk                                                               | Likelihood | Impact                 | Mitigation                                                                                           |
| --- | ------------------------------------------------------------------ | ---------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Banner-to-SITS codeset mapping is harder than estimated (Phase A1) | Medium     | Pushes A by 1 week     | Start from published Tribal/Ellucian mappings; treat custom codes as in-scope waivers, not blockers. |
| 2   | LLM provider cost or rate limits at demo time (Phase B)            | Low        | Demo embarrassment     | Provider-agnostic adapter, pre-warmed cache for demo dataset, local fallback model.                  |
| 3   | Azure/OCI sandbox access delays (Phase C)                          | Medium     | Pushes C by 2 weeks    | Start procurement of sandbox tenants in Phase A; have stub clients ready.                            |
| 4   | Partner pilot demands feature pull-forward (Phase B-D)             | High       | Distracts from roadmap | Documented out-of-scope list; pilot scope frozen at end of Phase B.                                  |
| 5   | HESA Data Futures schema changes during E1                         | Medium     | E1 rework              | Version-pin to a specific HESA release; track upcoming changes in a separate watcher cron.           |

## 10. Definition of done — v2.0 ENTERPRISE MILESTONE

A UK university can:

1. Procure DATABRIDGE through standard IT procurement (SSO, DPIA, SOC 2 evidence, Helm, multi-tenant).
2. Deploy it in their Azure tenant or OCI tenancy without bespoke engineering.
3. Connect Banner, SITS, Workday, TechOne, Salesforce Education Cloud, Dynamics 365 Education, Jisc, UCAS, SLC — whichever subset they run.
4. Run native + HESA + UCAS audit packs on day 1.
5. Use the LLM query bar to interrogate their data in natural language.
6. Plan a Banner↔SITS, SITS↔Workday, or anything↔HESA-TDP migration with full parallel-run verification.
7. Land the migration on Azure (SQL/Synapse/Fabric) or Oracle (ADW/GoldenGate).
8. Defend the migration to internal audit using DATABRIDGE's findings + waivers + delta + provenance trail.
9. Re-run the audits during HESA submission windows with calendar-aware safeguards.
10. Hand the platform to in-house operators after a 2-day training course.

---

_Plan baseline: workspace at `cc5d38b`. PR [#8](https://github.com/RJK134/DATABRIDGE/pull/8). Source data: package inventory under `packages/` and `apps/`, plus existing migration profile under `migrations/sits-to-hesa-tdp`._
