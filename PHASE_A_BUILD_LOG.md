# Phase A Build Log

Branch: `feat/phase-a-demo-build`
Base commit: `cc5d38b` (off `chore/v1.2-followups`)
Build window: overnight run, 2026-05-25 → 2026-05-26.

Baseline at start: **798/798 tests passing**, workspace typecheck +
build clean.

Final at handover: **976/976 tests passing**, typecheck + build clean.
Net delta: **+178 tests**.

---

## A1 — Banner↔SITS migrations, profile-banner, identity reverse-index, codeset seeds

**Status:** Done.
**Commit:** `8deae48` — `feat(phase-a/A1): Banner↔SITS migrations, profile-banner, bidirectional identity index, 12 codeset seeds`.
**Tests delta:** +63 (798 → 861).

### Done

- `migrations/banner-to-sits/` — full orchestrator with
  `BannerToSitsConfigSchema`, six entity surface (Student / Programme /
  Enrolment / TermGpa / CourseRegistration / Award), per-entity row
  validation with stable rule ids (`BANNER-MIG-01..10`), codeset-mapper
  integration, and `SitsLoadPlanWriter`-backed structured load plan.
- `migrations/sits-to-banner/` — symmetric reverse orchestrator with
  parallel rule ids (`SITS-MIG-01..10`) and `BannerLoadPlanWriter`.
- `profiles/profile-banner/` — entity map covering SPRIDEN, STVMAJR,
  STVCAMP, STVDEGC, STVTERM, SGBSTDN, SORLCUR, SORLFOS, SHRTGPA,
  SHRTCKG, SFRSTCR, SSBSECT, SHRDGMR; field catalogue with SITS / HESA
  counterparts; `BANNER_PROGRAMME_REGISTRATION_MAP` with CASE-style
  programme code transform and `canonicalToBannerEntity` /
  `bannerEntityToCanonical` resolvers.
- `packages/identity-reconciler/src/bidirectional-index.ts` — new
  `buildBidirectionalIndex`, `bannerToSits`, `sitsToBanner`,
  `resolveCanonicalFromBanner`, `resolveCanonicalFromSits`. Forward
  reconciler API untouched.
- `packages/codeset-mapper/maps/` — 12 new seed maps (6 forward, 6
  reverse) covering campus, programme stage, mode of attendance, level,
  sex, ethnicity. `CodesetMap.provenance` extended with
  `published-source | synthetic-default` markers.
- Pre-flight policy per migration (`BANNER_TO_SITS_PREFLIGHT_POLICY`,
  `SITS_TO_BANNER_PREFLIGHT_POLICY`) with deny-on-severity ≥ high,
  sample-size floor 100, required-codeset coverage ≥ 95%.
- Parallel-run-verifier integration test on a 500-row fixture
  demonstrating zero drift per migration profile.

### Partial / Deferred

- None for A1.

---

## A2 — Salesforce Education Cloud adapter + native audit pack + findings-integration-prep

**Status:** Done.
**Commit:** `4e40f3f` — `feat(phase-a/A2): Salesforce Education Cloud adapter, native audit pack, findings-integration-prep`.
**Tests delta:** +56 (861 → 917).

### Done

- `packages/adapter-salesforce-edu/` — full `SourceAdapter`
  implementation. OAuth2 client-credentials with token cache + refresh
  inside the 60-second freshness window, exponential backoff on
  429/5xx, SOQL query + `queryAll` async iterator with
  `nextRecordsUrl` paging, SObject describe with describe cache,
  `getRecord` with graceful 404 → null. Stub-fallback when
  `clientSecretKey` cannot be resolved. Live path tests exercise the
  injected `httpClientFactory`.
- Six canonical resources: Contact, Account, `hed__Program_Plan__c`,
  `hed__Affiliation__c`, `hed__Course_Enrollment__c`, `hed__Course__c`.
- `packages/audit-pack-salesforce-edu-native/` — 8 rules under family
  `SALESFORCE-EDU-NATIVE` (duplicate-email, orphan affiliation,
  programme-plan w/o enrolments, contact w/o affiliation, enrollment
  w/o course, FERPA mismatch, stale lead w/o programme, enrollment in
  inactive programme).
- `packages/findings-integration-prep/` — shared
  `generateIntegrationPrepReport` used by A2 and A3. Returns
  `create / update / skip / reject` verdicts with per-field deltas;
  supports a `rejectIf` predicate and a custom `normaliseKey` for
  case-sensitive identifier matches.
- `packages/rule-core` `RuleFamily` extended with
  `SALESFORCE-EDU-NATIVE` and `DYNAMICS365-EDU-NATIVE` values.
- 37 (adapter) + 11 (audit pack) + 8 (findings-integration-prep) tests.

### Partial / Deferred

- Bulk API 2.0 — the brief mentioned Bulk API 2.0 alongside REST. Phase
  A ships REST + Bulk-style paging via `queryAll`. The actual Bulk 2.0
  job lifecycle (create job → upload CSV → poll → download results) is
  deferred to Phase B because Phase A's adapter surface is read-only;
  Bulk 2.0 buys throughput on writes only. Read paths already use
  pagination so do not benefit from Bulk 2.0.

---

## A3 — Dynamics 365 Education adapter + native audit pack

**Status:** Done.
**Commit:** `57ed45d` — `feat(phase-a/A3): Dynamics 365 Education adapter + native audit pack`.
**Tests delta:** +47 (917 → 964).

### Done

- `packages/adapter-dynamics365-edu/` — full `SourceAdapter` for the
  Dataverse Web API. Azure AD OAuth2 client-credentials against
  `login.microsoftonline.com/<tenantId>/oauth2/v2.0/token` with
  `<dataverseUrl>/.default` scope, OData `$select` / `$filter` / `$top`
  queries, `@odata.nextLink` paging, `EntityDefinitions` describe with
  `$expand=Attributes`, retry on 429/5xx, stub-fallback when secret
  unresolved, graceful 404 → null for `getRecord`.
- Six canonical resources: contact, account, msdyn_program,
  msdyn_courseinstance, msdyn_studentprogram, msdyn_course.
- `packages/audit-pack-dynamics365-edu-native/` — 8 rules under family
  `DYNAMICS365-EDU-NATIVE` (duplicate emailaddress1, orphan
  studentprogram, active program w/o students, student contact w/o
  studentprogram, courseinstance w/o course, privacy preference
  mismatch, lead-converted contact w/o programme, studentprogram against
  inactive program).
- 37 (adapter) + 10 (audit pack) tests.

### Partial / Deferred

- None for A3.

---

## A4 — Demo harness + fixtures + presenter script

**Status:** Done.
**Commit:** `<head>` — `feat(phase-a/A4): demo harness app + fixtures + presenter script`.
**Tests delta:** +12 (964 → 976).

### Done

- `apps/demo/` — orchestrator (`src/index.ts`) loads the four bundled
  fixtures, runs the SALESFORCE / DYNAMICS native rules across all
  rows, projects canonical Student records from both Banner + SITS
  sides for the parallel-run verifier, computes SITS→Salesforce and
  SITS→Dynamics integration-prep totals, and prints a human-readable
  run summary (or `--json` for jq pipelines).
- `apps/demo/src/audit.ts` — lightweight in-process audit runner that
  builds shared rule context (seenEmails, contactToProgrammePlan,
  studentprogramContactIds, programStatus, …) in a single fixture scan
  so the audit pack's side-channel rules can run hermetically.
- `apps/demo/docker-compose.yml` — Postgres + apps/api + apps/web stack
  for the presenter to bring up on demo day.
- `apps/demo/fixtures/` — four synthetic-but-realistic JSON datasets,
  re-seedable from `apps/demo/scripts/generate-fixtures.ts`:
  - `banner-r2t-2024.json` — 2,400 students; codeset drift, historic
    truncation, structural integrity breaks, effective-dating gaps.
  - `sits-southcoast-2024.json` — 2,200 students; HUSID gaps,
    duplicate emails, codeset drift, historic truncation.
  - `salesforce-edu-westmidlands.json` — 2,000 Contact / Affiliation /
    Programme Plan rows; duplicate emails, orphan affiliations,
    FERPA mismatches, orphan enrolments.
  - `dynamics365-edu-northpennines.json` — 2,100 contact /
    msdyn_studentprogram / msdyn_courseinstance rows; duplicate
    emailaddress1, orphan studentprograms, PECR privacy mismatches,
    orphan course-instances.
- `docs/DEMO_SCRIPT.md` — 45-minute presenter script (5min setup /
  10min audit walkthrough / 10min CRM integration prep / 15min
  migration + parallel-run / 5min Q&A) with exact CLI commands per
  block and an appendix cheat sheet.

### Partial / Deferred

- Docker-compose bring-up isn't auto-executed by the orchestrator. The
  script prints the `docker compose ... up -d` command for the
  presenter to paste — this matches the demo-grade goal and keeps the
  orchestrator hermetic in CI. A "real" auto-bring-up that detects
  Docker, polls health, etc. is deferred to Phase B alongside the
  production write paths.

---

## Out-of-scope (deferred to later phases — per the brief)

- LLM-driven mapping suggestions (Phase B).
- Real Salesforce / Dynamics tenant integration testing (Phase A uses
  recorded fixtures only).
- Production-grade write paths into Banner / SITS (Phase A emits load
  plans; commits stay demo-grade).
- Cloud target adapters — Snowflake / BigQuery / Synapse (Phase C).
- RBAC / multi-tenancy UI (Phase D).

---

## Verification summary

```
$ pnpm -r typecheck   # all 51 workspace projects → Done
$ pnpm -r build       # all 51 workspace projects → Done
$ pnpm -r test        # 976/976 tests passing
```

Baseline 798 → final 976 = **+178 tests** across A1, A2, A3, A4.
