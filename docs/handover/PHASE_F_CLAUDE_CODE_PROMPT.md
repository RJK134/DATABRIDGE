# Claude Code Handover Prompt — Phase F (HESA-DF Additional Streams + v2.0 UK HE COMPLETE)

**Copy everything below the line into Claude Code as a single message.**

---

You are completing **Phase F of the DATABRIDGE delivery plan** — the remaining HESA Data Futures statutory streams (everything beyond Student) plus the v2.0 release. Read all three documents under `docs/build-history/` and the existing `packages/profile-hesa-tdp/`, `packages/audit-pack-hesa-df-student/`, and `packages/returns-generator-hesa-student-*/` from Phase HESA-DF — they establish the pattern you'll repeat for each stream.

## Repo state at start

- Branch off `main` at v1.8.0 tag (after Phase E merges)
- Create branch `feat/phase-f-hesa-df-additional-streams`
- Git user: `Freddie Finn <finnfreddie51@gmail.com>`
- Remote `rjk134` → `https://github.com/RJK134/DATABRIDGE.git`

## Scope — each stream follows the Phase HESA-DF eight-layer pattern (model, codesets, mappers, rules, generators, sign-off, repair, calendar)

### F1 — Provider stream (1 week)

- `packages/profile-hesa-provider/`
- `packages/audit-pack-hesa-df-provider/`
- `packages/returns-generator-hesa-provider-xml/` and `-json`

### F2 — Staff stream (1.5 weeks)

- `packages/profile-hesa-staff/`
- `packages/audit-pack-hesa-df-staff/` — ~80 rules
- `packages/hesa-mapper-sits-staff/`, `-banner-staff/`, `-workday-staff/`
- Returns generators

### F3 — Estates Management Record (EMR) (1 week)

- `packages/profile-hesa-emr/`
- `packages/audit-pack-hesa-df-emr/`
- Returns generators

### F4 — Graduate Outcomes (GOS) (1 week)

- `packages/profile-hesa-gos/`
- `packages/audit-pack-hesa-df-gos/`
- GOS-specific extraction (Jisc survey integration via Phase E's `adapter-jisc-*`)
- Returns generators

### F5 — Aggregate Offshore Record (AOS) (0.5 weeks)

- `packages/profile-hesa-aos/`
- `packages/audit-pack-hesa-df-aos/`
- Returns generators

### F6 — Finance Statistics Return (1.5 weeks)

- `packages/profile-hesa-finance/`
- `packages/audit-pack-hesa-df-finance/`
- `packages/hesa-mapper-techone-finance/` — TechOne FinanceOne → HESA Finance mapping
- Returns generators

### F7 — Pilot university delivery in parallel (ongoing during F1-F6)

- Document what's working with the partner pilot
- Surface real Quality Rule failures encountered and patch the pack
- Capture mapper gaps for v2.1 backlog

### F8 — v2.0 release artefacts (1 week)

- Comprehensive README rewrite
- `docs/architecture-overview.md` — final v2.0 architecture diagram and walkthrough
- `CHANGELOG.md` consolidating v1.0 → v2.0
- v2.0 release notes
- Marketing-ready demo recording (15-min full HESA cycle demo)

## Process

- One commit per F-workstream (F1-F8)
- `pnpm -r typecheck && pnpm -r build && pnpm -r test` clean after each
- Target: +500 tests across all streams
- PR title: `feat(phase-f): HESA-DF additional streams complete (Provider/Staff/EMR/GOS/AOS/Finance) + v2.0 UK HE COMPLETE release`
- PR body: stream-by-stream coverage table, v2.0 definition-of-done checklist (all 12 items from the revised delivery plan), pilot-learnings appendix

## Out of scope

- HESA streams not on the statutory list above
- Non-UK regulatory bodies (DfE, OfS direct submissions) — v2.1+
- Federated query across multiple universities — v2.1+

## Definition of done (also the v2.0 UK HE COMPLETE MILESTONE)

A UK university can:

1. Procure via standard IT procurement (SSO, DPIA, SOC 2 evidence, Helm, multi-tenant)
2. Deploy in Azure or OCI without bespoke engineering
3. Connect Banner / SITS / Workday / TechOne / SJMS / Salesforce / Dynamics / Jisc / UCAS / SLC
4. Run native + HESA audit packs day 1
5. Generate full HESA Data Futures cycle: Student + Provider + Staff + EMR + GOS + AOS + Finance
6. Pre-validate each return against HESA Quality Rules
7. NL data interrogation via the LLM query bar
8. Plan Banner↔SITS, SITS↔Workday, anything↔HESA migrations with parallel-run verification
9. Land on Azure (SQL/Synapse/Fabric) or Oracle (ADW/GoldenGate)
10. Run audits during HESA submission windows with calendar-aware safeguards
11. Repair source-system data based on findings
12. Hand to in-house operators after a 2-day training course

Tag `v2.0.0`, publish release, and that's the milestone.

Work autonomously.
