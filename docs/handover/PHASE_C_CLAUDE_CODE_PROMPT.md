# Claude Code Handover Prompt — Phase C (Cloud Target Adapters)

**Copy everything below the line into Claude Code as a single message. Claude Code will then work autonomously and open a PR at the end.**

---

You are completing **Phase C of the DATABRIDGE delivery plan** — cloud target adapters. Read `docs/build-history/00_BUILD_HISTORY.md`, `docs/build-history/01_HESA_DATA_FUTURES_AUDIT.md`, and `docs/build-history/02_REVISED_DELIVERY_PLAN.md` first. They contain full history, patterns, and the revised plan that places HESA-DF after this phase.

## Repo state at start

- Workspace at `/home/user/workspace/DATABRIDGE` (or wherever you have it cloned)
- Branch off `main` at the latest tagged release (`v1.4.0` or current)
- Create branch `feat/phase-c-cloud-targets`
- Git user: `Freddie Finn <finnfreddie51@gmail.com>`
- Remote `rjk134` → `https://github.com/RJK134/DATABRIDGE.git`
- Use the GitHub CLI (`gh`) for all GitHub operations. Never use a browser.
- pnpm monorepo, TypeScript strict, `exactOptionalPropertyTypes: true`

## Critical patterns (carry forward from v1.0–v1.4)

1. Adapter contract / stub-fallback — reference `packages/adapter-workday-raas/src/adapter.ts`
2. Peer-optional heavy deps — reference `packages/schema-mapper/src/learning-pg.ts`
3. `exactOptionalPropertyTypes: true` — never assign undefined; conditionally spread
4. Provenance on every external call
5. Target adapters extend the contract in `packages/target-adapters/`

## Phase C scope

### Workstream C1 — Azure target family (4 weeks)

- [ ] `packages/target-adapter-azure-adf` — emits Data Factory pipeline JSON; can also execute via management API. Authentication: managed identity, service principal, and az-cli local dev all supported via a shared `azure-auth` package.
- [ ] `packages/target-adapter-azure-synapse` — Synapse SQL pool loader: COPY INTO from staging blob, PolyBase optional. Supports both dedicated and serverless pools.
- [ ] `packages/target-adapter-azure-sql` — Azure SQL DB direct loader for smaller universities. Uses table-valued parameters or bulk copy.
- [ ] `packages/target-adapter-microsoft-fabric` — Lakehouse + Warehouse loader via OneLake.
- [ ] `packages/azure-auth` — shared package: MSAL token cache, managed identity, service principal, az-cli local dev.
- [ ] `apps/api` endpoint extension: `POST /v1/migrations/{runId}:land?target=azure-{adf|synapse|sql|fabric}`.

### Workstream C2 — Oracle target family (4 weeks)

- [ ] `packages/target-adapter-oracle-goldengate` — emits GG trail files for CDC into ADW or on-prem Oracle.
- [ ] `packages/target-adapter-oracle-adw` — direct loader to Autonomous Data Warehouse via wallet-based connection.
- [ ] `packages/target-adapter-oracle-oci-di` — OCI Data Integration task definitions.
- [ ] `packages/oracle-auth` — shared package: OCI wallet, IAM auth, instance principal.
- [ ] Same `apps/api` endpoint extension as C1.

### Workstream C3 — Phase B carry-overs (0.5 weeks)

From Phase B build log:

- [ ] Real ONNX tokeniser/inference for `schema-mapper-llm` embedding — ship the model file or document the install path.
- [ ] Live web E2E test for the `/query` NL bar — Playwright recommended.
- [ ] `apps/demo` orchestrator auto-launches `apps/web` and opens the query bar URL (was deliberately skipped for hermetic CI; ship behind a flag).

## Process

1. One commit per workstream (C1, C2, C3).
2. After each workstream, run `pnpm -r typecheck && pnpm -r build && pnpm -r test` clean.
3. Use `bash` for all git/gh operations.
4. Target test count: +150 (current baseline 1182).
5. If genuinely blocked, document in `PHASE_C_BUILD_LOG.md` and move on. Do not stall.
6. Open the PR against `RJK134/DATABRIDGE` targeting `main`:
   - Title: `feat(phase-c): cloud target adapters — Azure (ADF/Synapse/SQL/Fabric) + Oracle (GoldenGate/ADW/OCI-DI) + Phase B carry-overs`
   - Body: Done / Partial / Deferred, file inventory, test count delta, demo quickstart showing landing a migration on each target, **provider configuration table** (Azure auth modes, Oracle auth modes).
7. Push: `git push -u rjk134 feat/phase-c-cloud-targets`.
8. Final summary: PR URL, head SHA, test count delta, workstreams done, deferred items.

## Out of scope (defer)

- Real Azure / Oracle tenant integration testing — use recorded fixtures and stub-fallback. Document the install procedure for live testing.
- Multi-region failover topologies — Phase D.
- Cost monitoring / FinOps integration — Phase D.
- HESA Data Futures — that's Phase HESA-DF.

## Definition of done

- All 3 workstreams shipped OR explicitly deferred with documented reasons.
- `pnpm -r typecheck && pnpm -r build && pnpm -r test` all green.
- `PHASE_C_BUILD_LOG.md` committed with per-workstream Done/Partial/Deferred entries.
- PR opened, URL returned in final summary.

Work autonomously through the whole build. Use your judgement on routine implementation choices.
