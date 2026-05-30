import { describe, it, expect } from "vitest";
import corpus from "./corpus.json" with { type: "json" };
import { DeterministicMockProvider } from "../provider.js";
import { compileNlToRule } from "../index.js";

interface CorpusEntry {
  id: string;
  nl: string;
  expected: Record<string, unknown>;
}

interface CorpusFile {
  entries: CorpusEntry[];
}

const data = corpus as CorpusFile;

function providerFor(entry: CorpusEntry): DeterministicMockProvider {
  return new DeterministicMockProvider({
    entries: [{ match: entry.nl, response: entry.expected }],
  });
}

describe("NL → LlmRule corpus", () => {
  it("contains the full 50-entry corpus", () => {
    expect(data.entries).toHaveLength(50);
  });

  it("covers every demo entity at least once", () => {
    const entities = new Set(data.entries.map((e) => (e.expected["entity"] ?? "") as string));
    for (const e of [
      "Student",
      "Engagement",
      "Module",
      "Contact",
      "DataverseContact",
      "BannerStudent",
      "SitsStudent",
      "WorkdayStudent",
      "TechOneInvoice",
    ]) {
      expect(entities.has(e)).toBe(true);
    }
  });

  it.each(data.entries)("compiles corpus entry $id", async (entry) => {
    const provider = providerFor(entry);
    const result = await compileNlToRule(entry.nl, { provider });
    expect(result.rule.id).toBe(entry.expected["id"]);
    expect(result.rule.entity).toBe(entry.expected["entity"]);
    expect(result.llmRule.where).toBeDefined();
    expect(result.provenance.caller).toBe("rule-compiler-llm");
  });

  it("emits one provenance record per compile call", async () => {
    const first = data.entries[0]!;
    const provider = providerFor(first);
    const result = await compileNlToRule(first.nl, { provider });
    expect(result.provenance.callId).toBeDefined();
    expect(result.provenance.promptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a dry-run finding count when a dataset is supplied", async () => {
    const entry = data.entries.find((e) => e.id === "corpus-01")!;
    const provider = providerFor(entry);
    const dataset = [
      { sourceId: "S1", lastName: null },
      { sourceId: "S2", lastName: "Smith" },
      { sourceId: "S3", lastName: "" },
    ];
    const result = await compileNlToRule(entry.nl, { provider, dataset });
    expect(result.dryRunFindings).toBe(2);
  });

  it("respects an explicit idPrefix", async () => {
    const entry = data.entries[0]!;
    const provider = providerFor(entry);
    const result = await compileNlToRule(entry.nl, { provider, idPrefix: "nl" });
    expect(result.rule.id.startsWith("nl-")).toBe(true);
  });
});
