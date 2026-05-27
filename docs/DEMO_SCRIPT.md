# DataBridge — 55-Minute Demo Script (Phase A + Phase B, v1.4)

This script walks a presenter through the Phase A demo build end-to-end:
data-quality audits against four realistic UK HE fixtures, CRM
integration-prep against Salesforce and Dynamics, and the bidirectional
Banner↔SITS parallel-run migration. Phase B inserts a 10-minute LLM
walkthrough between the audit and migration sections.

**Audience:** prospective HE IT directors, data architects, and
registrar-office stakeholders. Pitch is "we show you the failure modes
in your data before you migrate, then we migrate it traceably — and we
let you ask the questions in plain English."

**Total budget:** 55 minutes.

| Block | Time  | Topic                                                              |
| ----- | ----- | ------------------------------------------------------------------ |
| 1     | 5 min | Setup + stack bring-up                                             |
| 2     | 10 min | Audit walkthrough across all four fixtures                        |
| 2B    | 10 min | LLM data review (NL → rule → findings + narrative)                |
| 3     | 10 min | CRM integration-prep (SITS → Salesforce, SITS → Dynamics)         |
| 4     | 15 min | Bidirectional Banner↔SITS migration + parallel-run verification   |
| 5     | 5 min | Q&A buffer / "what would Phase C / D add"                          |

---

## Block 1 — Setup (5 minutes)

Open a terminal at the repo root (`/path/to/DATABRIDGE`).

```bash
# 1. Install deps (cached — should be near-instant on a warm laptop).
pnpm install

# 2. Bring up Postgres + the api + the web UI.
docker compose -f apps/demo/docker-compose.yml up -d

# 3. Verify the api is healthy.
curl -s http://localhost:3000/health | jq
```

Stay on the terminal; the dashboard URL goes up at `http://localhost:5173`.

**Talking points** (≤ 60 seconds each):
- "DataBridge is the data-quality + migration layer that sits between
  your operational systems and your warehouse / collections."
- "Four sources today: Banner, SITS, Salesforce Education Cloud,
  Dynamics 365 Education. All hot-pluggable adapters under one shared
  contract."
- "We're going to show you four realistic UK fixtures with the
  failure modes UK HE actually has — codeset drift, identity collisions,
  effective-dating gaps, orphan FKs, FERPA / PECR consent mismatches."

---

## Block 2 — Audit walkthrough (10 minutes)

```bash
# Run the demo orchestrator end-to-end against the four fixtures.
pnpm --filter @databridge/demo run demo
```

Sample output you'll point at (numbers vary slightly by run):

```
Fixtures + audits:
  - banner-r2t-2024 (banner): 2400 rows, ... findings (... errors)
  - dynamics365-edu-northpennines (dynamics365-edu): 2100 rows, ... findings
  - salesforce-edu-westmidlands (salesforce-edu): 2000 rows, ... findings
  - sits-southcoast-2024 (sits): 2200 rows, ... findings
```

Walk through each fixture (~2 minutes each):

1. **`banner-r2t-2024.json`** (Round 2 Trent style, 2,400 students).
   Seeded failure modes:
   - **Codeset drift** — 1% of `SGBSTDN_MAJR_CODE_1` rows hold a legacy
     `XX_LEGACY` code that no longer exists in `STVMAJR`.
   - **Historic truncation** — 0.5% of rows have NULL `SPRIDEN_LAST_NAME`
     (a name-change migration that lost its trailing row).
   - **Structural integrity break** — 1% of `SGBSTDN_CAMP_CODE` rows
     point at the non-existent `ZZZ` campus.
   - **Effective-dating gap** — 0.8% of rows have
     `effectiveFrom > effectiveTo`.

2. **`sits-southcoast-2024.json`** (South Coast University style, 2,200 students).
   - **Identity collision risk** — 1% of `STU_HUSID` rows are NULL.
   - **Identity collision** — 1% share the same `shared@uni.example`
     email.
   - **Codeset drift** — 1% of `SCE_CAM` rows use the legacy `ZZ`
     campus.

3. **`salesforce-edu-westmidlands.json`** (West Midlands University style,
   2,000 Contact / Affiliation / Programme Plan rows).
   - **Duplicate Contact by email** (`SALESFORCE-EDU-01`).
   - **Orphan Affiliation** with no parent Account (`SALESFORCE-EDU-02`).
   - **Programme Plan = Current with no enrolments**
     (`SALESFORCE-EDU-03`).
   - **FERPA mismatch** — `hed__FERPA__c=Withheld` but
     `HasOptedOutOfEmail=false` (`SALESFORCE-EDU-06`).
   - **Orphan Enrolments** with no Course Offering
     (`SALESFORCE-EDU-05`).

4. **`dynamics365-edu-northpennines.json`** (North Pennines College style,
   2,100 contact / msdyn_studentprogram / msdyn_courseinstance rows).
   - **Duplicate emailaddress1** (`DYNAMICS365-EDU-01`).
   - **Orphan msdyn_studentprogram** missing `msdyn_program`
     (`DYNAMICS365-EDU-02`).
   - **PECR privacy mismatch** — `donotbulkemail=true` but contact still
     on a marketing list (`DYNAMICS365-EDU-06`).
   - **Orphan msdyn_courseinstance** missing `msdyn_course`
     (`DYNAMICS365-EDU-05`).

**Talking point:** "Every one of those failure modes is taken from a
real UK HE incident catalogue. The rules detected them in <1 second."

---

## Block 2B — LLM data review (10 minutes, Phase B / v1.4)

This block answers the most common follow-up question after the audit
walkthrough: "OK, but what if I want to ask a question that's NOT in the
rule pack?" The answer is the natural-language query bar.

Open the web app:

```
open http://localhost:3000/query
```

Pitch (≤ 60 seconds): "Everything in the audit pack was hand-curated by
our team. The query bar lets your registrar / data team ask the same
shape of question in English. We're absolutely strict about safety —
the LLM never emits SQL, never sees raw row data, and every call leaves
a hash-pair audit trail. Watch."

### The five demo prompts

Type each prompt verbatim, then click **Run**. The expected behaviour
is documented per prompt — these are the scripted prompts the
DeterministicMockProvider knows how to answer, so the demo works
without paid LLM access.

1. **Salesforce — shared placeholder email** *(fixture: salesforce-edu-westmidlands)*
   ```
   contacts with the placeholder shared email
   ```
   Expected: rule `contacts-shared-email`, severity `ERROR`, 2 of 5 sample
   contacts flagged (the two test rows with the shared placeholder
   address). Point at the **prompt sha256** and **response sha256** in the
   provenance pane: "That's what we hand to auditors. The raw prompt is
   never stored."

2. **Salesforce — FERPA withheld but not opted out** *(same fixture)*
   ```
   contacts with FERPA withheld but not opted out of email
   ```
   Expected: rule `contacts-ferpa-mismatch`, severity `ERROR`, 2 of 5
   sample contacts flagged. Highlight that this is a compound predicate
   (`and` of two `eq` clauses) — the grammar supports `and / or / not`
   nesting but never free SQL.

3. **Banner — legacy XX_LEGACY major code** *(fixture: banner-r2t-2024)*
   ```
   banner students whose major code is XX_LEGACY
   ```
   Expected: rule `banner-major-legacy`, severity `WARN`, 2 of 5 sample
   students flagged (the codeset-drift rows from Phase A). Point at the
   `fieldsRead` row: "We validated every field reference against the
   dictionary. If the LLM hallucinated `SGBSTDN_NONEXISTENT_FIELD` the
   compiler returns 422 — the rule is never executed."

4. **SITS — missing HUSID** *(fixture: sits-southcoast-2024)*
   ```
   sits students whose husid is null
   ```
   Expected: rule `sits-missing-husid`, severity `WARN`, 1 of 5 sample
   students flagged. Use this to talk about HESA submission readiness:
   "HUSID gaps block your HESA return. We've watched institutions ship
   their first sync at midnight and learn about HUSID gaps at 2 a.m.
   Now you learn at the audit step."

5. **Dynamics — opt-out parity** *(fixture: dynamics365-edu-northpennines)*
   ```
   dataverse contacts with donotbulkemail true
   ```
   Expected: rule `dataverse-bulk-optout`, severity `INFO`, 3 of 5 sample
   contacts flagged. Close the walkthrough on this one because it's an
   `INFO` finding — not every rule is a fire alarm.

### From the command line

The orchestrator can run the same five prompts in one shot — useful
for screenshots and CI:

```bash
pnpm --filter @databridge/demo run demo -- --json \
  | jq '.llm.prompts'
```

Each entry includes the rule id, fixture, finding count, provider,
latency, and the truncated sha256 hashes of the prompt and the
response. The full provenance record is persisted via
`provenance-core.InMemoryLlmCallSink` on the api gateway.

### Provider configuration

| Provider                | Env var(s)                                                          | Cost ceiling default |
| ----------------------- | ------------------------------------------------------------------- | -------------------- |
| DeterministicMock       | *(none — default)*                                                  | $0.50                |
| OpenAI                  | `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`)            | $0.50                |
| Anthropic               | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-3-5-haiku`) | $0.50                |
| Azure OpenAI            | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT` | $0.50          |
| Force mock              | `DATABRIDGE_LLM_FORCE_MOCK=1`                                       | $0.50                |

If no real provider is configured, the deterministic mock is selected
automatically. The cost ceiling is per-call and configurable via the
`costCeilingUsd` field on the request body.

### Narrative summary

After the five prompts, drop into a terminal:

```bash
curl -s -X POST http://localhost:3001/v1/findings/inline/narrate \
  -H 'content-type: application/json' \
  -d '{
        "provider": "mock",
        "findings": [
          {"id":"f1","ruleId":"contacts-ferpa-mismatch","severity":"ERROR","entityType":"Contact","subjectId":"001a"}
        ]
      }' | jq
```

Point at the response shape: four slot-validated strings, a markdown
rendering, and a provenance record. Talking point: "The LLM only fills
four slots — headline, severity breakdown, root cause, recommended
actions. Hard length caps and a regex on the allowed character set. No
markdown injection, no SQL keywords, no HTML — we tested it."

---

## Block 3 — CRM integration-prep (10 minutes)

```bash
# Re-run with --json to expose the integration-prep totals more cleanly.
pnpm --filter @databridge/demo run demo -- --json | jq '.integrationPrep'
```

Sample output:

```json
{
  "sitsToSalesforce": { "create": 200, "update": 2000, "skip": 0, "reject": 0 },
  "sitsToDynamics":   { "create": 100, "update": 2099, "skip": 1, "reject": 0 }
}
```

Show what the report means (~5 minutes):

- **`create`** — student exists in SITS but not in the CRM. The CRM team
  needs to provision them.
- **`update`** — student exists in both but at least one field differs
  (last name, email, etc.). Every diff is enumerated in the report's
  `findings[]` array with per-field source/target values.
- **`skip`** — identical row. No action required.
- **`reject`** — source row failed a pre-flight predicate (e.g. NULL
  `lastName`). Surfaces the row to a human before any sync happens.

Then drill into a single update finding via `jq`:

```bash
pnpm --filter @databridge/demo run demo -- --json \
  | jq '.fixtures[] | select(.source=="salesforce-edu") | .audit.findings[0:5]'
```

**Talking point:** "This is the report we hand to the CRM integration
team before the first sync runs. Done in a dry-run; no writes happen to
the live Salesforce / Dynamics tenant. The 'reject' bucket is the value
prop — those would have failed silently in the live sync and corrupted
the destination tenant."

---

## Block 4 — Bidirectional migration + parallel-run verification (15 minutes)

Talking points:

- "We migrate in either direction. Banner → SITS for a Tribal-bound
  institution; SITS → Banner for an Ellucian-bound one. Same adapter
  contract, same codeset mapper, same identity reconciler."

```bash
# Show what the Banner→SITS migration would do (load-plan only, no real write).
pnpm --filter @databridge/demo run demo -- --json | jq '.migrations'
```

Sample output:

```json
{
  "bannerToSits": { "rowsRead": 2400, "planTables": ["STU", "POS", "SCE", "STA"] },
  "sitsToBanner": { "rowsRead": 2200, "planTables": ["SPRIDEN", "STVMAJR", "SGBSTDN", "SHRTGPA"] }
}
```

Then show the parallel-run verifier output:

```bash
pnpm --filter @databridge/demo run demo -- --json | jq '.parallelRun'
```

Talking points:

- "Same canonical entity (Student) projected from both Banner and SITS.
  The verifier scores how closely the two projections agree at the
  field level — the **DHP** (Data Health Percentage)."
- "DHP < 1 isn't a failure — it tells the architect 'here are the
  fields that differ between your two systems, prioritise those for
  reconciliation before go-live.'"

Then talk through the codeset round-trip (~5 minutes):

```bash
# How many codeset translations does the registry know?
pnpm --filter @databridge/codeset-mapper exec node -e \
  "import('./dist/index.js').then(m => { const r = m.createDefaultRegistry(); console.log('Maps:', r.list().length); for (const x of r.list().slice(0, 6)) console.log(' -', x.id, x.provenance ?? '(published)'); })"
```

- "Every translation map carries a `provenance` flag. `published-source`
  means it's drawn from HESA / Tribal / Ellucian public documentation.
  `synthetic-default` means we generated a plausible default; your
  institution should register a tenant override before go-live."

Then walk the identity-reconciler reverse index:

- "Banner PIDM ↔ SITS STU.STUC ↔ canonical PersonId — bidirectional
  resolution in O(1) once the index is built. Reverse-direction lookups
  matter when an institution is moving Banner → SITS and needs to know
  'which SITS student does this Banner PIDM correspond to?'"

---

## Block 5 — Q&A buffer / Phase B preview (5 minutes)

Topics to be ready for:

- **"Why doesn't the demo execute a real SITS write?"** — Phase A is
  demo-grade; the load plan is structured + traceable. Phase B (next
  quarter) wires the production target adapters end-to-end.
- **"Where are the LLM-driven mappings?"** — Phase B. Today's mappings
  are deterministic and auditable. LLM-driven schema suggestions sit
  on top of that as an opt-in capability.
- **"How do you handle multi-tenant?"** — Tenant id flows through
  every secret access, every codeset lookup, every rule context. Phase
  D adds RBAC and tenant-scoped UIs.
- **"Cloud target adapters?"** — Phase C. Snowflake / BigQuery / Synapse
  targets sit on the same `TargetAdapter` contract.

**Closing:** "Everything you just saw runs against synthetic data, but
the rules + adapter contracts are production-ready. Your data, your
codesets, your tenant overrides — point us at a sandbox and we can have
a real run in two weeks."

---

## Appendix — Commands cheat sheet

```bash
# 1. Smoke
pnpm install
docker compose -f apps/demo/docker-compose.yml up -d
curl -s http://localhost:3000/health

# 2. Audit + migration + integration-prep
pnpm --filter @databridge/demo run demo

# 3. JSON output for drill-down
pnpm --filter @databridge/demo run demo -- --json | jq

# 4. Regenerate fixtures (if needed)
pnpm --filter @databridge/demo exec tsx scripts/generate-fixtures.ts

# 5. Tear down
docker compose -f apps/demo/docker-compose.yml down -v
```
