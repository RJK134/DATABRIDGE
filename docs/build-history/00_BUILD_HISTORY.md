# DATABRIDGE Build History — May 2026

This document captures the full build history of DATABRIDGE through the v1.4 DEMO MILESTONE, recorded as an in-repo record for the next contributor (human or AI).

## Timeline

| Date             | Event                                                                     | Tag       | PR    |
| ---------------- | ------------------------------------------------------------------------- | --------- | ----- |
| 26 May 2026 (AM) | Phases G/H/I/J/K-L + post-L hardening                                     | —         | #1-#6 |
| 26 May 2026 (PM) | v1.1.0 — live TechOne, audit-pack split, FsLearningStore                  | v1.1.0    | #7    |
| 26 May 2026 (PM) | v1.2.0 — PostgresLearningStore + Workday live HTTP + TechOne CIA fallback | v1.2.0    | #8    |
| 26 May 2026 (PM) | **v1.3.0 — Phase A DEMO build**                                           | v1.3.0    | #9    |
| 27 May 2026 (AM) | **v1.4 — Phase B LLM data review (PR open)**                              | (pending) | #10   |

## Test count progression

| Milestone             | Tests | Workspaces |
| --------------------- | ----- | ---------- |
| v1.0 (Phase L close)  | ~700  | ~40        |
| v1.1                  | 744   | 44         |
| v1.2                  | 798   | 47         |
| v1.3 (Phase A)        | 976   | 51         |
| v1.4 (Phase B PR #10) | 1182  | 55         |

## Phase A — DEMO build (v1.3.0, PR #9)

### Workstreams shipped

**A1 — Banner↔SITS migrations**

- `migrations/banner-to-sits/` — full canonical-via-canonical migration
- `migrations/sits-to-banner/` — symmetric reverse
- `packages/profile-banner/` — Banner canonical profile (mirror of profile-sits)
- `packages/identity-reconciler/` — bidirectional reverse-lookup index added
- `packages/codeset-seeds/` — 12 codeset mappings (6 per direction): campus, programme type, mode, level, gender, ethnicity. Synthetic-default flag where no published mapping exists.
- pre-flight-check policies for both profiles

**A2 — Salesforce Education Cloud**

- `packages/adapter-salesforce-edu/` — REST + OAuth2 client-credentials, stub-fallback pattern
- `packages/audit-pack-salesforce-edu-native/` — 8 rules, family `SALESFORCE-EDU-NATIVE`
- `packages/findings-integration-prep/` — shared CRM integration-prep report package

**A3 — Dynamics 365 Education**

- `packages/adapter-dynamics365-edu/` — Dataverse Web API, Azure AD OAuth2
- `packages/audit-pack-dynamics365-edu-native/` — 8 rules, family `DYNAMICS365-EDU-NATIVE`

**A4 — Demo harness**

- `apps/demo/` — scripted orchestrator + 4 synthetic fixtures (~2k rows each) with seeded UK HE failure modes
- `docs/DEMO_SCRIPT.md` — 45-minute presenter script

### Deferred from Phase A (carried to later phases)

- Salesforce Bulk API 2.0 write throughput → Phase B
- Docker-compose auto-bring-up in the demo orchestrator → Phase B
- All previously out-of-scope: LLM (B), real CRM tenants (B), prod write paths (B), cloud targets (C), RBAC (D)

## Phase B — LLM data review (v1.4, PR #10)

### Workstreams shipped

**B1 — NL→Rule compiler** (`packages/rule-compiler-llm/`)

- Grammar-constrained JSON output (`src/rule-grammar.ts`) — never free SQL
- 4 provider adapters: OpenAI, Anthropic, Azure OpenAI, DeterministicMockProvider (default)
- 50-prompt regression corpus
- `POST /v1/rules:compile` endpoint
- Cost ceiling default $0.50 per run
- Full provenance via `provenance-core`

**B2 — Schema-mapping LLM co-pilot** (`packages/schema-mapper-llm/`)

- `LlmAssistedSuggester` wraps existing `SchemaSuggester`
- LLM only invoked below confidence threshold (deterministic-first)
- ONNX embedding index (peer-optional) with deterministic hash fallback
- Every suggestion includes 2-3 sentence rationale
- Test proves deterministic-high-confidence path NEVER calls the LLM

**B3 — Narrative findings** (`packages/findings-narrative-llm/`)

- Strictly slot-templated output (regex-validated, character-limited)
- Slots: headline, severity bullets, top cluster root cause, recommended actions
- `POST /v1/findings/{runId}:narrate` endpoint

**B4 — Demo polish**

- `apps/web/query` — NL bar wired to compile endpoint
- Demo orchestrator: 5-prompt scripted run against fixtures
- `docs/DEMO_SCRIPT.md` Block 2B added (10-min LLM walkthrough)

### Safety guarantees (non-negotiable, enforced)

- LLM never emits free SQL — grammar-constrained JSON only
- Deterministic compiler executes; LLM only suggests structure
- DeterministicMockProvider is the default — demo runs with zero paid LLM access
- Every LLM call writes `provenance-core` record (prompt/response hashes, model id, latency, tokens, cost)
- Per-run cost ceiling enforced

### Deferred from Phase B (carried to later phases)

- Real ONNX tokeniser/inference → Phase C (sandbox lacks model file)
- Live web E2E test → Phase C
- Auto-launch of web from demo orchestrator → Phase C
- Real OpenAI/Anthropic/Azure tenant tests → Phase C+
- Vector database → Phase D
- Multilingual NL → Phase D
- Fine-tuning, RAG → out of scope

## Critical patterns established (must be carried forward)

1. **Adapter contract / stub-fallback** — reference `packages/adapter-workday-raas/src/adapter.ts`. `tryBuildClient(ctx)` returns undefined when secrets fail → deterministic stub output. `httpClientFactory` is the DI seam for tests.

2. **Peer-optional heavy deps** — `peerDependencies` + `peerDependenciesMeta.<dep>.optional = true`, lazy-import inside `loadX()` with helpful install message. Reference `packages/schema-mapper/src/learning-pg.ts`.

3. **`exactOptionalPropertyTypes: true`** — conditionally spread optional fields, never assign undefined.

4. **`FieldSuggestion`** uses `isFieldSuggestion()` type guard, NOT a `.kind` property.

5. **`StreamRowsPage.totalRows`** is OPTIONAL in `adapter-spec`.

6. **Provenance on every LLM call** — at the `LlmProvider` interface level. Hashes by default (not raw prompts).

7. **Audit pack shape** — rules in `src/rules.ts` (older packs) or `src/index.ts` (newer). Each rule has stable ID like `WORKDAY-INTEGRITY-04` plus a family.

8. **Migration profile shape** — uses `migration-runner`, `migration-policy`, `pre-flight-check`, `parallel-run-verifier`.

## Known issues at v1.4 PR-open time

1. **CI failing on main and PRs** since 26 May 21:57 CEST — Security + CI jobs RED on every push. Build/test runs locally clean (1182/1182). Investigate before tagging v1.4.0.
2. **HESA Data Futures gap** — `profiles/` directory does not exist; `migrations/sits-to-hesa-tdp` declares a workspace dep on `@databridge/profile-hesa-tdp` that has no implementation. This is now addressed in the revised delivery plan as a dedicated phase (HESA-DF) inserted between Phase C and Phase D.
3. **FHE billing endpoint** moved (HTTP 410) — the daily cron probe needs updating to use the new endpoint per https://gh.io/billing-api-updates-org.

## Operating constraints (must be respected)

- Repo: `RJK134/DATABRIDGE` (public). Moved from Future-Horizons-Education on 26 May 2026.
- Git user: `Freddie Finn <finnfreddie51@gmail.com>`
- GitHub CLI via `bash` with `api_credentials=["github"]`. NEVER `browser_task`.
- Crons (47bd0c13, 905b8118, b4bb629b) are READ-ONLY — no write actions via cron.
- ONE combined PR at end of each phase / batch.
- pnpm monorepo, TypeScript strict, `exactOptionalPropertyTypes: true`.
