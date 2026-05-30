# Claude Code Handover Prompt — Phase HESA-DF (HESA Data Futures complete, Student stream)

**Copy everything below the line into Claude Code as a single message. Claude Code will work autonomously and open a PR at the end.**

---

You are completing **Phase HESA-DF of the DATABRIDGE delivery plan** — the HESA Data Futures Student-stream end-to-end build. Read `docs/build-history/01_HESA_DATA_FUTURES_AUDIT.md` first — it contains the full capability audit and is the source-of-truth for this phase. Also read `docs/build-history/00_BUILD_HISTORY.md` for patterns and `docs/build-history/02_REVISED_DELIVERY_PLAN.md` §HESA-DF for scope.

## Repo state at start

- Workspace at `/home/user/workspace/DATABRIDGE`
- Branch off `main` at the v1.5.0 tag (after Phase C merges)
- Create branch `feat/phase-hesa-df-student-stream`
- Git user: `Freddie Finn <finnfreddie51@gmail.com>`
- Remote `rjk134` → `https://github.com/RJK134/DATABRIDGE.git`

## Existing HESA references in the repo (treat as baseline)

- `migrations/sits-to-hesa-tdp/` — scaffolding only; orchestrator validates batches but the `profile-hesa-tdp` workspace dep it imports does NOT exist. This phase fixes that.
- `packages/canonical/src/entities/student.ts` — has `hesaUSI`, `hesaSEXID` placeholders.
- `packages/dhp-core/` — has tests referencing `profileId: 'hesa-tdp'` and rule IDs `HESA-TDP-NNN`. Treat as fixtures only.
- `pnpm-workspace.yaml` — declares `profiles/*` glob but no directory exists. Either create `profiles/` and put `profile-hesa-tdp` there, or move it to `packages/profile-hesa-tdp/`. Be consistent with the rest of the monorepo.

## Phase HESA-DF scope

### HF1 — Canonical HESA model, Student stream (1.5 weeks)

- `packages/profile-hesa-tdp/` — finally implement the phantom dependency
- Full Student-stream entities with HESA reference names, types, codeset bindings
- Effective-dating on bi-temporal fields
- Collection-year version tag (e.g. `hesa.student.2024-25`)
- Zod schemas for every entity
- Make the existing `migrations/sits-to-hesa-tdp` orchestrator's import work

### HF2 — Statutory codesets, Student stream (0.5 weeks)

- `packages/codeset-seeds-hesa/`
- At minimum: HESA.SEXID, GENDERID, ETHNIC, NATION, MODE, LEVELQUAL, COURSEAIM, FUNDCODE, DOMICILE, SUBJECT (HECoS), JACS3 (legacy), FPE, STULOAD, QUALENT3, SOC
- Each bound to collection year 2024/25
- Source URLs cited in code comments
- Where the HESA published source requires download, ship the codeset values inline and link to source

### HF3 — Source→HESA mappers (2 weeks)

- `packages/hesa-mapper-sits/`
- `packages/hesa-mapper-banner/`
- `packages/hesa-mapper-workday/`
- `packages/hesa-mapper-sjms/`
- Each emits canonical HESA entities
- Unmappable rows become Findings
- Each uses the existing `schema-mapper` learning loop
- ≥ 20 tests per mapper

### HF4 — Quality Rules engine, Student stream (2 weeks)

- `packages/audit-pack-hesa-df-student/` — ~150 rules in first cut, focus on the most-failed
- Rule IDs match HESA published IDs verbatim
- Severity: HESA Error → ERROR (blocks return), Warning → WARN, Info → INFO
- Remediation hints lifted from HESA docs with citation
- ≥ 150 tests

### HF5 — Returns generators (1 week)

- `packages/returns-generator-hesa-student-xml/`
- `packages/returns-generator-hesa-student-json/`
- Validate output against published HESA XSD/JSON schema before writing
- Schema files committed under `packages/returns-generator-hesa-student-xml/schema/`

### HF6 — Sign-off + Validation Failure Report (1 week)

- `packages/hesa-signoff-report/` — pre-submission summary: row counts per entity, rule pass/fail counts per severity, year-on-year deltas
- `packages/hesa-vfr-parser/` — post-submission Validation Failure Report parser; surfaces specific records to fix
- Sign-off ledger in `apps/api` (extend the existing waiver/audit tables)

### HF7 — Repair workflow (1 week)

- `packages/repair-proposer/`
- Per source system: SITS Marvin update, Banner SQL, Workday Studio load proposals
- READ-ONLY in this phase (proposals only; operator applies manually)
- Each proposal includes: source rows, proposed change, justification (which rule failure it addresses), undo plan

### HF8 — Collection-year management (0.5 weeks)

- Year-versioned artefacts throughout: rule IDs, codesets, schemas, mappers
- `migration-policy` extension: deny migrations during HESA submission windows unless waivered
- New cron `hesa-cycle-watcher` (read-only) — tracks HESA published changes annually
- `docs/HESA_CYCLE_CALENDAR.md` — collection year calendar with submission windows

## Process

1. One commit per HF workstream (HF1 through HF8) — 8 commits total.
2. After each, `pnpm -r typecheck && pnpm -r build && pnpm -r test` clean.
3. Use `bash` + GitHub CLI for all git/gh operations.
4. Target test count: +400 (HF4 alone is ~150 rule tests). Baseline ~1330+ after Phase C.
5. Document blockers in `PHASE_HESA_DF_BUILD_LOG.md`. Do not stall.
6. PR title: `feat(phase-hesa-df): HESA Data Futures Student-stream complete — canonical model + codesets + mappers + quality rules + returns generators + sign-off + repair + calendar`
7. PR body must include:
   - Done / Partial / Deferred
   - File inventory
   - Test count delta
   - **A worked example**: input fixture (SITS-style sample) → canonical HESA → Quality Rules result → emitted XML → sign-off summary. Demonstrate end-to-end.
   - **Citation discipline statement**: every Quality Rule and codeset value cites its HESA published source.
8. Push: `git push -u rjk134 feat/phase-hesa-df-student-stream`.
9. Final summary: PR URL, head SHA, test count delta, workstreams done, deferred items.

## Out of scope (defer to Phase F)

- Provider stream
- Staff stream
- EMR (Estates Management Record)
- GOS (Graduate Outcomes)
- AOS (Aggregate Offshore Record)
- Finance Statistics Return

## Safety constraints

- Never include real student data in fixtures. Use synthetic data only.
- Repair proposals are READ-ONLY in this phase. Do not implement write-back to source systems.
- HESA Quality Rules ship with citation to published source. Where you paraphrase, flag it.

## Definition of done

- All 8 HF workstreams shipped OR explicitly deferred with documented reasons.
- The existing `migrations/sits-to-hesa-tdp` orchestrator imports the real `profile-hesa-tdp` package (no longer a phantom dep).
- A worked end-to-end example runs in `apps/demo` against a Phase A fixture.
- `pnpm -r typecheck && pnpm -r build && pnpm -r test` green.
- `PHASE_HESA_DF_BUILD_LOG.md` committed.
- PR opened, URL returned.

Work autonomously. Use your judgement.
