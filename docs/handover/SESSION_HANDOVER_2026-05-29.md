# DATABRIDGE — Session Handover for Claude Code

**Repo:** [RJK134/DATABRIDGE](https://github.com/RJK134/DATABRIDGE) (public)
**Owner:** Freddie Finn `<finnfreddie51@gmail.com>`
**Last green tag:** `v1.3.0` (Phase A DEMO) · **Pending tag:** `v1.4.0` (Phase B LLM — PR #10 merged 28 May 2026)
**Session compiled:** 29 May 2026

---

## 1. One-line direction for Claude Code

> Open the `RJK134/DATABRIDGE` repo. Read `docs/handover/README.md` first, then read every file under `docs/handover/` and `docs/build-history/`. Those documents contain the full next-phase build instructions — six phases (C, HESA-DF, D, E, F) with paste-ready prompts, the v2.0 revised delivery plan, the HESA Data Futures gap audit, and the build-history narrative covering v1.0→v1.4. Start with `docs/handover/PHASE_C_CLAUDE_CODE_PROMPT.md` unless I tell you otherwise. Do not invent scope — everything you need is in those two folders.

Paste that verbatim into Claude Code as your opening message.

---

## 2. Where the build instructions live (in-repo)

All authoritative next-phase material is committed to `main`:

### `docs/handover/` — paste-into-Claude-Code prompts

| File                                  | Purpose                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `README.md`                           | Index + usage notes for the prompts                                                             |
| `PHASE_C_CLAUDE_CODE_PROMPT.md`       | Phase C — next up                                                                               |
| `PHASE_HESA_DF_CLAUDE_CODE_PROMPT.md` | **NEW** phase inserted between C and D — full HESA Data Futures capability (10 weeks, 8 layers) |
| `PHASE_D_CLAUDE_CODE_PROMPT.md`       | Phase D                                                                                         |
| `PHASE_E_CLAUDE_CODE_PROMPT.md`       | Phase E                                                                                         |
| `PHASE_F_CLAUDE_CODE_PROMPT.md`       | Phase F                                                                                         |

### `docs/build-history/` — context Claude Code needs before coding

| File                            | Purpose                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `00_BUILD_HISTORY.md`           | Full v1.0→v1.4 narrative, recurring patterns, known issues                                                                               |
| `01_HESA_DATA_FUTURES_AUDIT.md` | Why HESA-DF was added as its own phase — gap analysis, codeset coverage, identified phantom workspace dep `@databridge/profile-hesa-tdp` |
| `02_REVISED_DELIVERY_PLAN.md`   | v2.0 plan — six phases, 38 weeks total                                                                                                   |

### Legacy (kept for history at repo root)

- `DATABRIDGE_GAP_ANALYSIS.md` — original gap analysis
- `DATABRIDGE_DELIVERY_PLAN.md` — original 5-phase plan (superseded by `docs/build-history/02_REVISED_DELIVERY_PLAN.md`)

---

## 3. Current repo state (as of 29 May 2026)

### Branches & PRs

- `main` is clean and ahead — both **PR #10** (Phase B) and **PR #11** (docs) merged on 28 May.
- No open PRs.

### Tags & releases

| Tag                        | PR           | Theme                                                   | Tests    |
| -------------------------- | ------------ | ------------------------------------------------------- | -------- |
| v1.0.0                     | #1–#6        | Phases G→L + post-L hardening                           | ~700     |
| v1.1.0                     | #7           | Live TechOne, audit-pack split, FsLearningStore         | 744      |
| v1.2.0                     | #8           | PostgresLearningStore + Workday live + TechOne CIA      | 798      |
| v1.3.0                     | #9           | Phase A DEMO — Banner↔SITS + SF/Dynamics + demo harness | 976      |
| **v1.4.0** _(pending tag)_ | #10 (merged) | Phase B — LLM data review                               | **1182** |

> Action: cut the `v1.4.0` tag + release when convenient. Phase B is fully merged but not yet tagged.

### Health signals

- **0 open Dependabot alerts** (high/moderate/low) — confirmed by cron 905b8118 on 28 May.
- **4/4 hard blockers RESOLVED** — pnpm-lock present, ESLint config present, oracledb peer-optional flag set, `apps/api/Dockerfile` present.
- **CI on `main` has been RED since 26 May 21:57** — Security + CI jobs failing post-merge. Pre-existing, not introduced by Phase B. Worth investigating but not blocking Phase C kickoff.
  - Latest failed runs (28 May):
    - CI (main) — [run 26500594681](https://github.com/RJK134/DATABRIDGE/actions/runs/26500594681)
    - Security (main) — [run 26500594648](https://github.com/RJK134/DATABRIDGE/actions/runs/26500594648)

---

## 4. Build progression — what's already shipped

### v1.0–v1.3 (pre-Phase B)

- Adapter framework (`adapter-spec`) with stub-fallback pattern
- Adapters: SITS-Oracle, Banner-Oracle, Workday-RaaS (live HTTP), TechOne (live + CIA cube), SJMS5, Salesforce, Dynamics
- Schema mapper with learning store — both `FsLearningStore` and `PostgresLearningStore`
- Audit pack split into discrete modules
- Phase A DEMO harness — Banner↔SITS migration demo with deterministic playback

### v1.4 — Phase B (LLM data review) — just merged

- **B1:** NL→Rule compiler with grammar-constrained LLM + provenance + $0.50/run cost ceiling
- **B2:** Schema-mapping LLM co-pilot — deterministic-first with LLM tie-breaker
- **B3:** Narrative findings report with strict slot grammar + API endpoint
- **B4:** Web query bar + demo LLM walkthrough + DEMO_SCRIPT update
- **1182/1182 tests green** across 55 workspaces

---

## 5. Critical patterns to preserve (carry into C/HESA-DF/D/E/F)

These are non-negotiable conventions discovered during v1.0–v1.4. Claude Code must respect them:

1. **Adapter contract / stub-fallback** — canonical reference: `packages/adapter-workday-raas/src/adapter.ts`. `tryBuildClient(ctx)` returns `undefined` on secret failure → deterministic stub output. `httpClientFactory` is the DI seam for tests.
2. **Peer-optional heavy deps** — `peerDependencies` + `peerDependenciesMeta.<dep>.optional = true`, lazy-import inside `loadX()` helper with helpful install message. Reference: `packages/schema-mapper/src/learning-pg.ts`.
3. **`exactOptionalPropertyTypes: true`** in `tsconfig` — conditionally spread optional fields, never assign `undefined`.
4. **`FieldSuggestion`** uses `isFieldSuggestion()` type guard, **not** a `.kind` property.
5. **`StreamRowsPage.totalRows`** is **optional** in `adapter-spec`.
6. **Provenance on every LLM call** at the `LlmProvider` interface level. Hashes by default for PII safety. `DeterministicMockProvider` is the default — demo runs with zero paid LLM access. Cost ceiling: $0.50/run default.
7. **LLM never emits free SQL** — grammar-constrained JSON only.
8. **ONE combined PR per phase**, atomic commits inside.
9. **pnpm monorepo, TypeScript strict.**

---

## 6. Known traps

### `@databridge/profile-hesa-tdp` phantom workspace dep

`migrations/sits-to-hesa-tdp` currently declares a workspace dep on `@databridge/profile-hesa-tdp` which **does not exist**. `pnpm-workspace.yaml` declares the `profiles/*` glob but the directory is absent. The new HESA-DF phase (`PHASE_HESA_DF_CLAUDE_CODE_PROMPT.md`) is scoped to create this profile package and back-fill the dependency cleanly. Do not paper over this with a workspace-protocol hack — build it properly.

### The Perplexity GitHub-proxy quirk (only matters if Claude Code uses `gh` here)

- `gh auth status` **always** reports "token in `GH_ENTERPRISE_TOKEN` is invalid" against `git-agent-proxy.perplexity.ai`.
- This is **cosmetic only.** `gh api`, `gh pr list`, `gh run list` all work.
- **Skip `gh auth status` entirely.** Never escalate on its output.
- The three morning crons (47bd0c13, 905b8118, b4bb629b) were patched 27 May with explicit bypass instructions.

### FHE billing endpoint deprecated

- `/orgs/Future-Horizons-Education/settings/billing/actions` returns HTTP 410 (moved per `https://gh.io/billing-api-updates-org`).
- DATABRIDGE repo moved from `Future-Horizons-Education` to `RJK134` on 26 May 2026. FHE path is dormant.

---

## 7. Action items pending on Freddie's side

1. **Tag + release `v1.4.0`** (Phase B is merged but not tagged yet)
2. **Investigate persistent CI failure on `main`** — pre-existing since 26 May 21:57, not Phase B-introduced
3. **Start Phase C** — paste [`docs/handover/PHASE_C_CLAUDE_CODE_PROMPT.md`](https://github.com/RJK134/DATABRIDGE/blob/main/docs/handover/PHASE_C_CLAUDE_CODE_PROMPT.md) into Claude Code

---

## 8. Active background crons (Europe/Zurich)

All read-only. All hardened against the GH-proxy `auth status` quirk on 27 May.

| ID       | Time (CEST) | Purpose                                                  | Status                          |
| -------- | ----------- | -------------------------------------------------------- | ------------------------------- |
| b4bb629b | 7:30        | Morning watch (FHE + RJK134) — new H/C + drift           | Healthy — last run 28 May 07:33 |
| 905b8118 | 7:45        | Dependabot pre-standup scan                              | Healthy — last run 28 May 07:46 |
| 47bd0c13 | 8:00        | Pre-standup status check (commits / PRs / CI / blockers) | Healthy — last run 28 May 08:03 |

All three fire Mon–Fri.

---

## 9. Recommended kickoff sequence for Claude Code

```text
1. Read docs/handover/README.md
2. Read all five docs/handover/PHASE_*_CLAUDE_CODE_PROMPT.md
3. Read docs/build-history/00_BUILD_HISTORY.md
4. Read docs/build-history/01_HESA_DATA_FUTURES_AUDIT.md
5. Read docs/build-history/02_REVISED_DELIVERY_PLAN.md
6. Confirm understanding back to Freddie — list the six phases in order
7. Open docs/handover/PHASE_C_CLAUDE_CODE_PROMPT.md and begin Phase C
```

---

## 10. Links

- Repo: [RJK134/DATABRIDGE](https://github.com/RJK134/DATABRIDGE)
- Handover index: [`docs/handover/README.md`](https://github.com/RJK134/DATABRIDGE/blob/main/docs/handover/README.md)
- Build history: [`docs/build-history/00_BUILD_HISTORY.md`](https://github.com/RJK134/DATABRIDGE/blob/main/docs/build-history/00_BUILD_HISTORY.md)
- HESA-DF audit: [`docs/build-history/01_HESA_DATA_FUTURES_AUDIT.md`](https://github.com/RJK134/DATABRIDGE/blob/main/docs/build-history/01_HESA_DATA_FUTURES_AUDIT.md)
- Revised plan: [`docs/build-history/02_REVISED_DELIVERY_PLAN.md`](https://github.com/RJK134/DATABRIDGE/blob/main/docs/build-history/02_REVISED_DELIVERY_PLAN.md)
- Phase C prompt: [`docs/handover/PHASE_C_CLAUDE_CODE_PROMPT.md`](https://github.com/RJK134/DATABRIDGE/blob/main/docs/handover/PHASE_C_CLAUDE_CODE_PROMPT.md)
- Security alerts: [Dependabot](https://github.com/RJK134/DATABRIDGE/security/dependabot)
- Actions: [CI runs](https://github.com/RJK134/DATABRIDGE/actions)
