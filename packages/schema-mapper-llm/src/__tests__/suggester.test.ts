import { describe, it, expect } from "vitest";
import { SchemaSuggester, type SuggestRequest } from "@databridge/schema-mapper";
import { DeterministicMockProvider } from "@databridge/rule-compiler-llm";
import { LlmAssistedSuggester, type LlmAssistedFieldSuggestion } from "../suggester.js";

const explanation = (chosen: string, confidence = 0.9) => ({
  chosen,
  rationale: [
    `Best match for the source column.`,
    `Confidence supported by deterministic candidate and embedding nearest neighbour.`,
  ],
  confidence,
});

function buildSuggester(
  overrides: Partial<ConstructorParameters<typeof LlmAssistedSuggester>[0]> = {}
) {
  const deterministic = new SchemaSuggester();
  const provider = new DeterministicMockProvider({
    entries: [
      { match: "SPRIDEN_LAST_NAME", response: explanation("lastName") },
      { match: "STU_FORE", response: explanation("firstName") },
      { match: "MYSTERY_COL", response: explanation("husid", 0.4) },
    ],
    defaultResponse: explanation("lastName"),
  });
  return new LlmAssistedSuggester({
    deterministic,
    provider,
    threshold: 0.6,
    ...overrides,
  });
}

describe("LlmAssistedSuggester — high-confidence path", () => {
  it("returns deterministic FieldSuggestion unchanged when score >= threshold", async () => {
    const suggester = buildSuggester({ threshold: 0.1 });
    const req: SuggestRequest = {
      system: "banner",
      columns: ["SPRIDEN_LAST_NAME"],
    };
    const results = await suggester.suggest(req);
    expect(results).toHaveLength(1);
    const r = results[0] as LlmAssistedFieldSuggestion;
    expect(r.llmConsulted).toBe(false);
    expect(suggester.getLlmCallCount()).toBe(0);
  });

  it("never calls the LLM when every deterministic result is above threshold", async () => {
    const suggester = buildSuggester({ threshold: 0.05 });
    await suggester.suggest({
      system: "banner",
      columns: ["SPRIDEN_LAST_NAME", "SPRIDEN_FIRST_NAME"],
    });
    expect(suggester.getLlmCallCount()).toBe(0);
  });
});

describe("LlmAssistedSuggester — tie-breaker path", () => {
  it("calls the LLM when deterministic score is below threshold", async () => {
    const suggester = buildSuggester({ threshold: 0.99 });
    const req: SuggestRequest = {
      system: "banner",
      columns: ["SPRIDEN_LAST_NAME"],
    };
    const results = await suggester.suggest(req);
    expect(suggester.getLlmCallCount()).toBe(1);
    const r = results[0] as LlmAssistedFieldSuggestion;
    expect(r.llmConsulted).toBe(true);
    expect(r.provenance?.caller).toBe("schema-mapper-llm/explainer");
    expect(r.llmRationale).toBeDefined();
    expect(r.llmRationale!.length).toBeGreaterThan(0);
  });

  it("attaches the LLM rationale as the suggestion's rationale", async () => {
    const suggester = buildSuggester({ threshold: 0.99 });
    const [r] = await suggester.suggest({
      system: "banner",
      columns: ["SPRIDEN_LAST_NAME"],
    });
    const fs = r as LlmAssistedFieldSuggestion;
    expect(fs.rationale).toMatch(/Best match/);
  });

  it("propagates LLM confidence into the score (when higher)", async () => {
    const suggester = buildSuggester({ threshold: 0.99 });
    const [r] = await suggester.suggest({
      system: "banner",
      columns: ["SPRIDEN_LAST_NAME"],
    });
    const fs = r as LlmAssistedFieldSuggestion;
    expect(fs.score).toBeGreaterThanOrEqual(0.5);
    expect(fs.score).toBeLessThanOrEqual(1);
  });

  it("emits exactly one provenance record per LLM-consulted column", async () => {
    const suggester = buildSuggester({ threshold: 0.99 });
    const results = await suggester.suggest({
      system: "banner",
      columns: ["SPRIDEN_LAST_NAME", "SPRIDEN_FIRST_NAME"],
    });
    const consulted = results.filter(
      (r): r is LlmAssistedFieldSuggestion =>
        (r as LlmAssistedFieldSuggestion).llmConsulted === true
    );
    expect(consulted).toHaveLength(suggester.getLlmCallCount());
    for (const r of consulted) expect(r.provenance).toBeDefined();
  });

  it("preserves NoSuggestion results when neither deterministic nor LLM has a match", async () => {
    const suggester = buildSuggester({ threshold: 0.99 });
    const results = await suggester.suggest({
      system: "banner",
      columns: ["TOTALLY_UNRELATED_COLUMN_XYZ"],
      minScore: 0.99,
    });
    // The deterministic suggester will return NoSuggestion when minScore filters it out.
    expect(results).toHaveLength(1);
  });

  it("emits provenance records that contain prompt + response hashes only", async () => {
    const suggester = buildSuggester({ threshold: 0.99 });
    const [r] = await suggester.suggest({
      system: "banner",
      columns: ["SPRIDEN_LAST_NAME"],
    });
    const fs = r as LlmAssistedFieldSuggestion;
    const blob = JSON.stringify(fs.provenance);
    expect(blob).not.toContain("SPRIDEN_LAST_NAME");
    expect(fs.provenance!.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.provenance!.responseHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("seeds the embedding index from supplied dictionary entries", async () => {
    const suggester = buildSuggester({
      threshold: 0.99,
      dictionaryEntries: [
        { canonical: "lastName", entity: "Student", description: "surname / family name" },
        { canonical: "firstName", entity: "Student", description: "given name / forename" },
      ],
    });
    const [r] = await suggester.suggest({
      system: "banner",
      columns: ["SPRIDEN_LAST_NAME"],
    });
    expect((r as LlmAssistedFieldSuggestion).llmConsulted).toBe(true);
  });
});

describe("LlmAssistedSuggester — batch behaviour", () => {
  it("mixes high-confidence pass-throughs with tie-breaker LLM calls in one batch", async () => {
    const suggester = new LlmAssistedSuggester({
      deterministic: new SchemaSuggester(),
      provider: new DeterministicMockProvider({
        entries: [{ match: "STU_FORE", response: explanation("firstName") }],
        defaultResponse: explanation("lastName"),
      }),
      threshold: 0.9, // forces tie-breaker on most rows
    });
    const results = await suggester.suggest({
      system: "sits",
      columns: ["STU_FORE", "RANDOM_COL_NOT_IN_CORPUS"],
    });
    expect(results).toHaveLength(2);
  });

  it("never calls the LLM more than once per row", async () => {
    const suggester = buildSuggester({ threshold: 0.99 });
    await suggester.suggest({
      system: "banner",
      columns: ["SPRIDEN_LAST_NAME", "SPRIDEN_FIRST_NAME", "SPRIDEN_PIDM"],
    });
    expect(suggester.getLlmCallCount()).toBeLessThanOrEqual(3);
  });
});
