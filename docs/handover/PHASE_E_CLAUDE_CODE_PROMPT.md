# Claude Code Handover Prompt — Phase E (UK HE Ecosystem Hardening)

**Copy everything below the line into Claude Code as a single message.**

---

You are completing **Phase E of the DATABRIDGE delivery plan** — UK HE ecosystem integration and failure-mode hardening. Read `docs/build-history/00_BUILD_HISTORY.md`, `docs/build-history/02_REVISED_DELIVERY_PLAN.md` §E, and `DATABRIDGE_DELIVERY_PLAN.md` §7 (the failure-mode catalogue) first.

## Repo state at start

- Branch off `main` at v1.7.0 tag (after Phase D merges)
- Create branch `feat/phase-e-uk-he-ecosystem`
- Git user: `Freddie Finn <finnfreddie51@gmail.com>`
- Remote `rjk134` → `https://github.com/RJK134/DATABRIDGE.git`

## Scope

### E1 — UK ecosystem connectors (2 weeks)

- `packages/adapter-jisc-learning-analytics/` — Jisc LA Service connector
- `packages/adapter-ucas/` — UCAS Link adapter for applications and decisions
- `packages/adapter-slc/` — Student Loans Company HEP Services connector
- `packages/adapter-tef-data/` — TEF data submission helper
- Each: full `AdapterSpec` (sample, stream, dictionary, codelists), stub-fallback pattern, ≥ 20 tests

### E2 — Failure-mode controls (2 weeks)

Each control runnable, not just docs. Based on the 12-item UK HE transformation failure-mode catalogue:

- `packages/control-codeset-coverage-gate/` — pre-flight gate; deny migration if codeset mapping < 100% of in-use codes
- `packages/control-effective-dating-completeness/` — new rule family `EFFECTIVE-DATING-NN`
- `packages/control-historic-fidelity/` — `parallel-run-verifier` extension; verify N years of historic enrolments survive round-trip
- `packages/control-programme-structure-integrity/` — new rule family `PROGRAMME-STRUCTURE-NN`
- `packages/control-identity-ambiguity-report/` — `identity-reconciler` ambiguity report; mandatory triage before migration
- `packages/control-returns-impact-diff/` — "will this migration change your last submitted HESA return?" — runs rule pack against pre/post canonical, diffs
- `packages/control-returns-calendar/` — collision detection: migration cutover scheduled across a HESA submission window

### E3 — Pilot conversion (1 week)

- Reference customer case study (from whichever university pilot is active)
- Sales collateral: pricing model, statement of work template, support tiers
- 2-day operator training programme, materials in `docs/training/`

### E4 — Documentation hardening (1 week)

- `docs/operator-guide.md` — customer-facing operator guide
- `docs/admin-runbook.md` — admin operations
- `docs/incident-response-playbook.md`
- `docs/adrs/` — Architecture Decision Records for the major choices made through v1.0–v2.0

## Process

- One commit per E-workstream
- `pnpm -r typecheck && pnpm -r build && pnpm -r test` clean after each
- Target: +150 tests
- PR title: `feat(phase-e): UK HE ecosystem hardening — Jisc/UCAS/SLC/TEF connectors + 7 failure-mode controls + pilot conversion materials + ADRs`
- PR body includes: failure-mode-to-control mapping table, ADR list, pilot conversion runbook
- Push and open PR via `gh` CLI

## Out of scope

- HESA streams beyond Student (Phase F)
- Real Jisc/UCAS/SLC tenant integration testing (recorded fixtures only)
- Multi-region deployment topologies

## Definition of done

- A UK university can run a procurement-stage Banner↔SITS data review pilot using the failure-mode controls as the operational backbone
- `PHASE_E_BUILD_LOG.md` committed
- PR URL returned

Work autonomously.
