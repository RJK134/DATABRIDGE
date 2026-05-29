# Phase B Build Log

Branch: `feat/phase-b-llm-review`
Base commit: `bce9cce` (merged main with v1.3.0)
Target tag: **v1.4** (demo milestone).

Baseline at start: **976/976 tests passing**.
Final at handover: **1182/1182 tests passing**.
Net delta: **+206 tests**.

---

## B1 — Natural-language rule compiler (`packages/rule-compiler-llm`)

**Status:** Done.
**Commit:** `f92629f` — `feat(phase-b/B1): NL→Rule compiler with grammar-constrained LLM + provenance + cost ceiling`.

### Done

- **`@databridge/provenance-core`** extended with the LLM-call surface:
  - `LlmCallProvenance` record — hashes only, never raw prompts.
  - `buildLlmCallProvenance()`, `sha256Hex`, `sha256Json`,
    `stableStringify` helpers.
  - `InMemoryLlmCallSink` for tests + the demo orchestrator.
  - `CostCeiling` + `CostCeilingExceededError` — structured failure
    mode, never an unhandled exception.
- **`packages/rule-compiler-llm`** — the headline package.
  - `src/rule-grammar.ts` — zod grammar for `LlmRule`. Predicates limited
    to `eq, neq, in, notIn, isNull, isNotNull, gt, lt, gte, lte, between,
matches`. Clauses are `and / or / not` nesting. NO SQL, NO joins, NO
    raw strings beyond 200-char literals. `staticSafetyCheck` rejects
    SQL keywords smuggled into `messageTemplate` and injection-looking
    literals.
  - `src/dictionary.ts` — `RuleDictionary` + `DEMO_DICTIONARY` covering
    Student, Engagement, Module, Contact, DataverseContact, Banner-,
    SITS-, Workday-, and TechOne-shaped entities.
  - `src/provider.ts` — `LlmProvider` interface,
    `DeterministicMockProvider` (default in tests + demo, costs $0),
    `OpenAiProvider`, `AnthropicProvider`, `AzureOpenAiProvider` — all
    peer-optional via lazy `import()`. `selectProviderFromEnv()` reads
    `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `AZURE_OPENAI_*` and falls
    back to the mock; `DATABRIDGE_LLM_FORCE_MOCK=1` forces the mock.
  - `src/compiler.ts` — `compileLlmRule()` validates grammar, runs
    safety check, validates every field reference against the
    dictionary, rejects cross-entity references, emits a `CompiledRule`
    with `evaluate()` and `renderMessage()`. Loose equality coerces
    numeric strings; `matches` swallows invalid regexes.
  - `src/index.ts` — `compileNlToRule()`, `RULE_GRAMMAR_SCHEMA` (JSON
    Schema sent to real providers verbatim).
  - `src/__tests__/corpus.json` — **50 NL → LlmRule pairs** spanning
    every demo entity. The regression suite runs each entry through the
    deterministic mock to prove the compiler accepts the documented
    grammar variants.
- **`apps/api`** — `POST /v1/rules:compile` handler. Accepts
  `{ nl, provider?, cannedEntries?, dataset?, costCeilingUsd?, dictionary? }`,
  returns `{ rule, provenance, dryRunFindings? }`. 422 on grammar /
  safety / dictionary failures, 429 on cost-ceiling exhaustion.
  Provenance flows through `InMemoryLlmCallSink`.

### Partial / Deferred — none.

---

## B2 — Schema-mapping LLM co-pilot (`packages/schema-mapper-llm`)

**Status:** Done.
**Commit:** `6c38694` — `feat(phase-b/B2): schema-mapping LLM co-pilot — deterministic-first with LLM tie-breaker`.

### Done

- `LlmAssistedSuggester` wraps `SchemaSuggester` from the existing
  `@databridge/schema-mapper` package. Behaviour:
  - Deterministic suggester first.
  - If score ≥ threshold (default 0.6) → return unchanged. The LLM is
    NEVER called in this path; a dedicated test asserts this.
  - Otherwise, merge deterministic candidates with embedding nearest
    neighbours and call the LLM tie-breaker via the strict
    `EXPLANATION_SCHEMA` grammar (chosen string + ≤ 3 rationale
    sentences + confidence in [0, 1]). Rationale sentences are regex-
    validated to forbid HTML, markdown, and SQL.
- Every LLM call emits an `LlmCallProvenance` record; suggestions
  carrying an LLM-derived rationale include the call id.
- `src/embedding.ts` — `DeterministicHashEmbedding` (the default,
  256-dim, L2-normalised, sliding-shingle features, hermetic).
  `OnnxEmbedding` — peer-optional via `onnxruntime-node`; falls back to
  the deterministic variant when no model is configured.
  `selectEmbeddingBackendFromEnv()` reads
  `DATABRIDGE_EMBEDDINGS_ONNX_PATH`.
- `src/explainer.ts` — `ExplanationZ` zod schema + `EXPLANATION_SCHEMA`
  JSON Schema sent verbatim to real providers.
- `LlmAssistedSuggester.getLlmCallCount()` exposes a hot-path counter so
  tests can assert the no-LLM path quantitatively.

### Partial / Deferred

- **Real ONNX inference path** — `OnnxEmbedding.embed()` loads the
  session lazily but defers the tokeniser + model run to a Phase C
  follow-up; until then it delegates to the deterministic hash. The
  brief explicitly permitted this fallback when the model isn't
  installed in the sandbox.

---

## B3 — Narrative findings report (`packages/findings-narrative-llm`)

**Status:** Done.
**Commit:** `f591067` — `feat(phase-b/B3): narrative findings report with strict slot grammar + API endpoint`.

### Done

- `packages/findings-narrative-llm` — slot-based templated narrative
  generator.
  - `src/template.ts` — `NarrativeSlotsZ` zod schema. Four slots:
    - `headline_sentence` (≤ 220 chars, plain text only)
    - `severity_breakdown_bullets` (1–6 bullets, each ≤ 180 chars)
    - `top_cluster_root_cause` (≤ 420 chars)
    - `recommended_next_actions` (1–6 items, owner + verb-phrase,
      optional priority 1–5)
      Every slot's character set is enforced by `NARRATIVE_RE` — no
      markdown, no HTML, no SQL keywords, no backticks / asterisks /
      brackets / pipes.
  - `src/render.ts` — `renderText()` and `renderMarkdown()` are pure.
    Actions sorted by priority asc, unprioritised last.
  - `src/narrator.ts` — `narrate()` short-circuits when `findings` is
    empty (saves a paid LLM call). Otherwise builds a structured
    prompt (totals by severity, top rules, top entities) and asks the
    provider for the four slots.
- **`apps/api`** — `POST /v1/findings/{runId}:narrate` handler.
  Supports both the slash form `/v1/findings/:runId/narrate` and the
  Google-AIP custom-method form. Resolves `runId` via the AuditStore;
  supports inline findings via `runId=inline` for ad-hoc summaries
  (used by the demo orchestrator). 404 / 409 / 422 / 429 status codes
  with structured error bodies.

### Partial / Deferred — none.

---

## B4 — Demo polish + query bar

**Status:** Done.
**Commit:** `<head>` — `feat(phase-b/B4): web query bar, demo LLM walkthrough, DEMO_SCRIPT update`.

### Done

- **`apps/web` query bar** at `/query`:
  - Single NL input + fixture selector + Run button.
  - Calls `POST /v1/rules:compile` against the api gateway with the
    selected fixture's sample rows in the request body.
  - Renders the compiled rule (id, entity, severity, fields read) plus
    the **provenance pane** (provider, model, latency, truncated prompt
    - response sha256, cost) in a two-column layout.
  - "Demo prompts" row offers 5 one-click shortcuts that load the
    canned NL into the input.
  - `data-testid` attributes on every interactive element so the
    presenter can wire a browser-test harness later.
  - `app/query/fixtures.ts` ships a small (3–5 row) representative
    slice per Phase A fixture plus the 5-prompt library — mirrors the
    rule-compiler-llm corpus expectations.
  - Layout + home page extended with a "Query bar" nav link.
- **`apps/demo` orchestrator** extended:
  - `src/llm-walkthrough.ts` — `SCRIPTED_PROMPTS` catalogue (5 prompts,
    one per Phase A fixture) and `runLlmWalkthrough()` runner.
  - `main()` runs the walkthrough against the real ~2k-row fixtures and
    folds the result into the `DemoReport.llm` field. Falls through to
    `selectProviderFromEnv()` so a real provider can take over when env
    vars are set.
  - Synthesised findings are passed to `narrate()` to produce a
    templated executive summary. Best-effort — missing canned
    responses don't fail the walkthrough.
  - Human report now prints per-prompt finding counts and the
    provenance hash prefixes; the JSON report exposes the full
    `llm.prompts[]` array. Output also lists the new
    `http://localhost:3000/query` URL.
- **`docs/DEMO_SCRIPT.md`** retitled `55-Minute Demo Script (Phase A +
Phase B, v1.4)` with a new **Block 2B — LLM data review** (10 min)
  inserted between the audit walkthrough and the CRM integration-prep
  section. Includes the five exact NL prompts to type, expected
  finding counts, talking points around safety / provenance / cost
  ceilings, and a provider configuration table.

### Partial / Deferred

- **Live `apps/web` end-to-end test** (jsdom/playwright) — not
  shipped. The fixtures module has unit tests (8 cases) that prove
  every prompt compiles and every fixture has the expected drift /
  truncation rows. A browser-level test would re-prove the manual
  presenter flow; deferred to Phase C alongside the wider UI test
  story.
- **Auto-launch of the web app from the demo orchestrator** — the
  orchestrator prints the query-bar URL but does not spawn `next
start` itself. Same trade-off as Phase A's docker-compose: keeps the
  orchestrator hermetic in CI. The DEMO_SCRIPT shows the exact
  `pnpm --filter @databridge/web run dev` command.

---

## Provider configuration table

| Provider          | Env var(s)                                                                 | Cost ceiling default |
| ----------------- | -------------------------------------------------------------------------- | -------------------- |
| DeterministicMock | _(none — default)_                                                         | $0.50                |
| OpenAI            | `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`)                   | $0.50                |
| Anthropic         | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-3-5-haiku`)        | $0.50                |
| Azure OpenAI      | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT` | $0.50                |
| Force mock        | `DATABRIDGE_LLM_FORCE_MOCK=1`                                              | $0.50                |

## Safety statement

- The LLM **never emits free SQL** at any surface in Phase B. It only
  emits JSON satisfying a strict zod-validated grammar (`LlmRuleZ`,
  `ExplanationZ`, `NarrativeSlotsZ`). The deterministic compiler runs
  the rule; the deterministic renderer composes the narrative.
- Field references are validated against the dictionary; cross-entity
  references are rejected; SQL keywords / injection-looking literals
  are caught by `staticSafetyCheck`.
- Every LLM call emits an `LlmCallProvenance` record carrying
  sha256(prompt), sha256(response), model id, latency, token counts
  (when reported), cost estimate, and caller surface. Raw prompts are
  hashed, never stored.
- Per-run cost ceiling defaults to **$0.50** and is configurable per
  request. `CostCeilingExceededError` is a structured failure mode.

---

## Verification

```
$ pnpm -r typecheck   # all workspace projects → Done
$ pnpm -r build       # all workspace projects → Done (apps/web includes /query)
$ pnpm -r test        # 1182 / 1182 tests passing
```

Baseline 976 → final 1182 = **+206 tests** across B1, B2, B3, B4.
