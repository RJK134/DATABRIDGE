# DATABRIDGE — UK HE Production Readiness Gap Analysis

**Audience:** Freddie Finn (architect), and prospective UK university partners evaluating DATABRIDGE for a Banner ↔ SITS, Workday ↔ SITS, or SJMS ↔ SITS data-review / system-transformation engagement.
**Date:** 26 May 2026
**Baseline:** PR #8 (v1.2-followups, commit `cc5d38b`) on `RJK134/DATABRIDGE` — 798/798 tests passing, full workspace typecheck + build clean.
**Repo:** [RJK134/DATABRIDGE](https://github.com/RJK134/DATABRIDGE) (public).

---

## 1. Headline

DATABRIDGE today is a **credible mid-pilot** product for UK HE data-interrogation and audit work on the four most common SRM/finance stacks (SITS, Banner, Workday Student, TechOne FinanceOne) plus SJMS5. It can run a structured data-quality and integration-readiness review for a UK university **today**, and produce defensible evidence (rules, findings, waivers, deltas, reconciliations, parallel-run reports).

It is **not yet** an enterprise-platform tool. The four largest gaps before a university partner can adopt it as their canonical transformation tool are:

1. **No CRM integration-prep adapters** (Salesforce Education Cloud, Microsoft Dynamics 365 Education) — blocks the "integration prep for CRM" promise.
2. **No platform-target adapters** for Azure (ADF / Synapse / Fabric) or Oracle (GoldenGate / OCI Data Integration) — blocks "platforming on common university platforms".
3. **AI-driven mapping is deterministic only** — no LLM-backed suggester or natural-language data-interrogation surface, despite the framing as "AI-driven".
4. **One migration profile (`sits → hesa-tdp`)** — banner↔sits, workday↔sits and ↔hesa-tdp profiles are not yet implemented.

Everything else (interrogation, audit, error logging/fixing, provenance, identity reconciliation, parallel-run verification) is genuinely production-shaped, with tests, against real source-system data models.

---

## 2. What's working today (post-v1.2)

### 2.1 Source-system adapters — 9 packages

| Adapter                      | Mode       | Surface                   | Status                                 |
| ---------------------------- | ---------- | ------------------------- | -------------------------------------- |
| `adapter-sits-oracle`        | Oracle SQL | Direct OS warehouse       | Live                                   |
| `adapter-sits-api`           | REST       | SITS REST gateway         | Live                                   |
| `adapter-sits-file`          | File       | XML/CSV extract drops     | Live                                   |
| `adapter-banner-oracle`      | Oracle SQL | Ellucian Banner warehouse | Live                                   |
| `adapter-banner-ethos`       | REST       | Banner Ethos API          | Live                                   |
| `adapter-workday-raas`       | REST       | Workday RaaS reports      | **v1.2: live HTTP** with stub fallback |
| `adapter-techone-financeone` | REST       | F1 REST + CIA cube        | **v1.2: CIA fallback** controller      |
| `adapter-sjms5`              | REST       | Freddie's own SJMS 2.5    | Live                                   |
| `adapter-spec`               | n/a        | Shared adapter contract   | —                                      |

All adapters implement the same `AdapterSpec` contract: `sampleRows`, `streamRows`, `getDictionary`, `getCodelists` — so the engine treats every source uniformly. This is the foundation of "interrogate any university's data the same way regardless of vendor".

### 2.2 Audit packs — 4 native packs, 49 rules total

| Pack                             | Rules | Family                   | Notes                                                                |
| -------------------------------- | ----- | ------------------------ | -------------------------------------------------------------------- |
| `audit-pack-sits-native`         | 10    | `SITS-NATIVE`            | SRA/SCE/SMR integrity, codeset coverage                              |
| `audit-pack-banner-native`       | 10    | `BANNER-NATIVE`          | SPRIDEN/STVCAMP/SHRTGPA integrity                                    |
| `audit-pack-workday-native`      | 16    | `WORKDAY-INTEGRITY`      | Identity, programme, registration, marks, awards, HESA, BPs, finance |
| `audit-pack-techone-fin1-native` | 13    | `TECHONE-FIN1-INTEGRITY` | AR, GL, postings, codesets per F1 §19                                |

Rules are versioned, ID-stable (e.g. `WORKDAY-INTEGRITY-04`), and emit structured findings with severity, surface, and reproducible context.

### 2.3 Findings & data-quality ops — 8 packages

- **`finding-delta`** — diff this run's findings against last run; first-seen / resolved / persisting classes.
- **`finding-reproducer`** — re-run a single finding against a frozen sample to bisect a fix.
- **`finding-waivers`** — time-bounded exemptions with reason codes; auditable trail.
- **`severity-by-surface`** — promotes/demotes severity based on which subject area is touched.
- **`reconciliation-report`** — paired source-vs-target row counts and totals.
- **`pre-flight-check`** — gates a migration run on a configurable rule subset.
- **`parallel-run-verifier`** — runs old-system and new-system side-by-side and reports drift.
- **`operational-input-queue`** — durable, ordered handoff between extract and audit stages.

### 2.4 Schema mapping & learning — 6 stores

- `MemoryLearningStore`, `FsLearningStore` (v1.1), **`PostgresLearningStore` + `CachedPostgresLearningStore`** (v1.2 — async-pg, sync wrapper, peer-optional `pg` so consumers without Postgres aren't broken).
- `SchemaSuggester` returns `FieldSuggestion[]` ranked by acceptance history → genuinely "learns" from operator decisions across engagements.

### 2.5 Provenance, identity, effective dating

- `provenance-core` — every canonical row carries source system + extract timestamp + transform chain.
- `identity-reconciler` — cross-system identity resolution (e.g. Banner PIDM ↔ SITS STU.STUC ↔ Workday Student_ID).
- `effective-dating` — bi-temporal date handling for programme/course/award changes.
- `dhp-core` — Data Handling Policy core: classification, retention, masking.

### 2.6 Migration

- `migration-runner` — orchestrates extract → audit → transform → load.
- `migration-policy` — declarative policies (deny-on-severity, sample-size, etc.).
- `migrations/sits-to-hesa-tdp` — **one** working end-to-end profile.
- `profile-sits`, `profile-hesa-tdp` — canonical profile definitions.
- `target-adapters` — target-side writer contract (Postgres target proven).

### 2.7 Apps

- `apps/api` — 145 tests; REST surface for triggering runs, retrieving findings, managing waivers.
- `apps/cli` — 15 tests; operator-facing CLI for one-shot runs.
- `apps/web` — minimal viewer.

---

## 3. Gap analysis vs UK HE enterprise target

Scoring: ✅ ready · 🟡 partial / pilot-only · ❌ gap.

### 3.1 Data interrogation (sample, stream, dictionary, codelists) — ✅

All 5 source systems (SITS three flavours, Banner two flavours, Workday RaaS, TechOne F1, SJMS5) implement the same `AdapterSpec`. A university can point DATABRIDGE at their warehouse / REST endpoint / file drop and get uniform `sampleRows` + dictionary + codelists out the same day.

**Caveat:** the schema dictionaries (`dictionary-sits`, `dictionary-banner`) are hand-curated and partial. Workday and TechOne dictionaries are derived from adapter resource maps; not full HESA-mapped.

### 3.2 Audit & data quality — ✅

49 source-native rules across SITS/Banner/Workday/TechOne. Rules are extensible: a university can drop their own pack into `packages/audit-pack-<customer>-local` and the engine picks it up.

**Caveat:** no UK-specific HESA rule pack yet — only `profile-hesa-tdp` for the migration target, not standalone HESA returns auditing.

### 3.3 Error logging / fixing / reproducibility — ✅

`finding-reproducer`, `finding-delta`, `finding-waivers` plus structured severity-by-surface gives an auditor everything they need to triage, document, exempt, and demonstrate fix-through over time. This is the strongest dimension.

### 3.4 Integration prep (CRM) — ❌

**No CRM adapters.** UK universities are overwhelmingly on Salesforce Education Cloud or Dynamics 365 Education for admissions/student engagement CRM. DATABRIDGE has no read or write adapter for either.

**To close:** `adapter-salesforce-education-cloud` and `adapter-dynamics-365-education` — read-only first (audit current CRM data quality), then write (push reconciled student records). Estimate: 1 sprint each, mirroring the Workday RaaS adapter shape.

### 3.5 Platforming on Azure / Oracle — ❌

**No platform-target adapters.** `target-adapters` is a Postgres-shaped target writer. UK universities migrating systems land on:

- **Azure:** Data Factory pipelines, Synapse Analytics, Microsoft Fabric, Azure SQL.
- **Oracle:** Oracle GoldenGate (CDC), OCI Data Integration, ADW (Autonomous Data Warehouse).

**To close:** `target-adapter-azure-adf` (pipeline JSON + Synapse SQL target), `target-adapter-oracle-goldengate` (GG trail file emitter + ADW target). Estimate: 2 sprints each — these are non-trivial because they require streaming/CDC, not batch.

### 3.6 Migration coverage — 🟡

Working: `sits → hesa-tdp` (1 profile, end-to-end).
Missing (each is a real UK university transformation scenario):

| From    | To              | Demand                                    | Effort    |
| ------- | --------------- | ----------------------------------------- | --------- |
| Banner  | SITS            | High (Banner-leaving universities → SITS) | 1 sprint  |
| SITS    | Workday Student | High (Workday land-grab)                  | 2 sprints |
| Banner  | Workday Student | High                                      | 2 sprints |
| Workday | HESA-TDP        | High (Workday-on-UK regulatory)           | 1 sprint  |
| Banner  | HESA-TDP        | Medium                                    | 1 sprint  |

The runner, policy engine, identity reconciler, and parallel-run-verifier already exist — these are profile + mapping work, not engine work.

### 3.7 AI-driven mapping & interrogation — 🟡

Working: deterministic `SchemaSuggester` with learning store (memory / FS / Postgres) — improves with operator feedback, fully auditable.

Missing:

- **LLM-backed suggester** that explains its suggestions and proposes mappings for unseen schemas without prior corpus.
- **Natural-language data-interrogation surface** ("how many of our 2024/25 entrants have a missing programme of study?" → executable rule). The `apps/web` viewer is minimal; no query-builder.
- **Embedding-based field similarity** for cross-system mapping when names diverge (SITS `STU.STUC` ↔ Workday `Student_ID`).

**To close:** `packages/schema-mapper-llm` wrapping the deterministic suggester with an LLM tie-breaker + explainer. Embedding index over the dictionaries. NL→rule compiler in `apps/api`. Estimate: 2 sprints for a credible first cut.

### 3.8 Operational hardening — 🟡

Working: 798 tests, CI/CD via three workflows, Dependabot alerts watched daily, structured logging via `platform`.

Missing for enterprise sell:

- **SOC 2 / ISO 27001 evidence trail** — `dhp-core` has the primitives but no compliance reports.
- **RBAC** — current API is single-role; no per-tenant or per-surface permissioning.
- **Multi-tenancy** — DB and config assume single university; would need namespacing.
- **Observability** — no OpenTelemetry, no metrics endpoint, no SLO dashboard.
- **Helm chart / Terraform module** for repeatable Azure/AKS deployment.

---

## 4. University-partner pilot recommendation

### 4.1 What DATABRIDGE can do for a partner **today**, end-to-end

A UK university running **Banner today, considering SITS** (or **SITS today, considering Workday**, or **either → HESA-TDP for regulatory uplift**) can use DATABRIDGE right now for:

1. **Data-quality baseline** of their current SRM (Banner / SITS / Workday) — 49 native rules + dictionary + codelist coverage report, delivered as a findings pack.
2. **Identity reconciliation report** across SRM ↔ finance (TechOne F1) ↔ legacy SJMS — proving how many students exist in only one system, how many disagree across systems.
3. **Pre-migration parallel-run** for the `sits → hesa-tdp` route (only that route).
4. **Findings triage workflow** — waivers, deltas across runs, reproducer for fix verification, severity-by-surface for risk weighting.
5. **Schema-mapping co-pilot** — operator proposes mapping, system learns, future runs auto-suggest.

### 4.2 What to declare out-of-scope for a pilot

- CRM integration prep (Salesforce/Dynamics) — **defer to v1.4**.
- Azure ADF / Oracle GoldenGate target landing — **defer to v1.4**.
- Migration profiles other than `sits → hesa-tdp` — **per-engagement build**; quote separately.
- LLM-driven natural-language interrogation — **defer to v1.3**.
- SOC 2 / multi-tenancy / RBAC — **defer; pilot in single-tenant Azure VM with NDA**.

### 4.3 Suggested pilot shape (2 weeks, fixed scope)

| Week        | Activity                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Mon-Tue | Deploy DATABRIDGE on a single Azure VM (Postgres + API + CLI). Wire university's read-only Banner / SITS / Workday endpoint.        |
| 1 — Wed-Fri | Run all relevant native audit packs. Produce findings pack v0. Joint triage session — flag waivers, classify severity.              |
| 2 — Mon-Wed | Identity reconciliation across SRM ↔ finance. Schema-mapping session for any custom local extensions.                               |
| 2 — Thu     | Re-run; deliver `finding-delta` report showing closed/resolved items. Parallel-run-verifier dry-run if a target system is in scope. |
| 2 — Fri     | Readout: gap analysis specific to **their** estate, scoped quote for v1.3/v1.4 features they want next.                             |

This is a sellable engagement **today** with the current `cc5d38b` codebase.

---

## 5. 6-month roadmap to enterprise-ready

| Milestone            | Scope                                                                                                          | Outcome                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **v1.3** (4-6 weeks) | LLM-backed suggester · NL→rule compiler · embedding index · banner↔sits + workday↔hesa-tdp profiles            | "AI-driven" credible. 3 migration profiles.  |
| **v1.4** (6-8 weeks) | Salesforce Education Cloud adapter (read) · Dynamics 365 Education adapter (read) · `target-adapter-azure-adf` | CRM integration-prep + Azure target.         |
| **v1.5** (6-8 weeks) | `target-adapter-oracle-goldengate` · Oracle ADW target · RBAC + multi-tenancy in apps/api                      | Oracle target + safe multi-customer hosting. |
| **v1.6** (4 weeks)   | OpenTelemetry · Helm chart · SOC 2 evidence pack · DPIA template                                               | Enterprise procurement-ready.                |

End-state at v1.6: a defensible enterprise pitch as "the AI-driven data-interrogation, audit, integration-prep and migration tool for UK HE system transformations across Banner/SITS/Workday/SJMS, landing on Azure or Oracle".

---

## 6. Bottom line

**You're closer than the marketing language suggests for audit + interrogation, and further than it suggests for CRM/platforming/AI.** For a Banner ↔ SITS or Workday ↔ SITS _review_ engagement — which is the most common UK conversation right now — you have a sellable pilot today on `cc5d38b`. For a _transformation_ engagement that lands on Azure or Oracle with CRM integration, you need v1.4 and v1.5, which is ~3-4 months of focused work on top of the existing engine.

The engine itself (adapter contract, audit pack contract, findings ops, identity reconciliation, parallel-run verification, migration runner, learning store) is sound and would not need re-architecting to support the missing surfaces. Everything outstanding is adapter-shaped or profile-shaped work, not engine-shaped.

---

_Sources: live workspace at `cc5d38b`. PR [#8](https://github.com/RJK134/DATABRIDGE/pull/8). Package inventory verified against `packages/_`on the`chore/v1.2-followups` branch.\*
