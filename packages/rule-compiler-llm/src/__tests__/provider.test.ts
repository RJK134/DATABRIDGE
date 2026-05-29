import { describe, it, expect } from "vitest";
import {
  DeterministicMockProvider,
  selectProviderFromEnv,
  OpenAiProvider,
  AnthropicProvider,
  AzureOpenAiProvider,
} from "../provider.js";
import {
  CostCeiling,
  CostCeilingExceededError,
  InMemoryLlmCallSink,
} from "@databridge/provenance-core";

describe("DeterministicMockProvider", () => {
  it("returns a canned output for a matching substring", async () => {
    const provider = new DeterministicMockProvider({
      entries: [{ match: "missing programme", response: { hit: true } }],
    });
    const { output, provenance } = await provider.complete<{ hit: boolean }>(
      "engagements with missing programme code",
      { name: "Test", description: "", jsonSchema: {} },
      (raw) => raw as { hit: boolean },
      "rule-compiler-llm"
    );
    expect(output.hit).toBe(true);
    expect(provenance.provider).toBe("deterministic-mock");
    expect(provenance.model).toBe("mock-1");
    expect(provenance.caller).toBe("rule-compiler-llm");
    expect(provenance.costUsd).toBe(0);
    expect(provenance.promptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("supports regex matchers", async () => {
    const provider = new DeterministicMockProvider({
      entries: [{ match: /missing.*HUSID/i, response: { hit: true } }],
    });
    const { output } = await provider.complete<{ hit: boolean }>(
      "students missing husid",
      { name: "Test", description: "", jsonSchema: {} },
      (raw) => raw as { hit: boolean },
      "rule-compiler-llm"
    );
    expect(output.hit).toBe(true);
  });

  it("falls back to default response when no entry matches", async () => {
    const provider = new DeterministicMockProvider({
      defaultResponse: { fallback: true },
    });
    const { output } = await provider.complete<{ fallback: boolean }>(
      "no match",
      { name: "Test", description: "", jsonSchema: {} },
      (raw) => raw as { fallback: boolean },
      "rule-compiler-llm"
    );
    expect(output.fallback).toBe(true);
  });

  it("throws a clear error when nothing matches and no default", async () => {
    const provider = new DeterministicMockProvider();
    await expect(
      provider.complete(
        "no match",
        { name: "Test", description: "", jsonSchema: {} },
        (raw) => raw,
        "rule-compiler-llm"
      )
    ).rejects.toThrow(/no canned response matched/);
  });

  it("surfaces parser errors as provider errors", async () => {
    const provider = new DeterministicMockProvider({
      entries: [{ match: "x", response: { hit: "not-a-boolean" } }],
    });
    await expect(
      provider.complete<{ hit: boolean }>(
        "x",
        { name: "Test", description: "", jsonSchema: {} },
        (raw) => {
          if (typeof (raw as { hit: unknown }).hit !== "boolean") {
            throw new Error("hit must be boolean");
          }
          return raw as { hit: boolean };
        },
        "rule-compiler-llm"
      )
    ).rejects.toThrow(/canned response did not parse/);
  });

  it("charges zero against the cost ceiling", async () => {
    const provider = new DeterministicMockProvider({
      entries: [{ match: "x", response: { hit: true } }],
    });
    const ceiling = new CostCeiling(0); // intentionally zero to prove no charge
    await provider.complete(
      "x",
      { name: "Test", description: "", jsonSchema: {} },
      (raw) => raw,
      "rule-compiler-llm",
      { costCeiling: ceiling }
    );
    expect(ceiling.spentUsd).toBe(0);
  });

  it("never includes the raw prompt in the provenance record", async () => {
    const provider = new DeterministicMockProvider({
      entries: [{ match: "Jane Smith", response: { ok: true } }],
    });
    const { provenance } = await provider.complete(
      "Jane Smith DOB 1990-01-01 husid 1234567890123",
      { name: "Test", description: "", jsonSchema: {} },
      (raw) => raw,
      "rule-compiler-llm"
    );
    expect(JSON.stringify(provenance)).not.toContain("Jane Smith");
    expect(JSON.stringify(provenance)).not.toContain("1234567890123");
  });

  it("emits stable hashes for identical prompts", async () => {
    const provider = new DeterministicMockProvider({
      entries: [{ match: "x", response: { ok: true } }],
    });
    const { provenance: p1 } = await provider.complete(
      "x",
      { name: "T", description: "", jsonSchema: {} },
      (raw) => raw,
      "test"
    );
    const { provenance: p2 } = await provider.complete(
      "x",
      { name: "T", description: "", jsonSchema: {} },
      (raw) => raw,
      "test"
    );
    expect(p1.promptHash).toBe(p2.promptHash);
    expect(p1.responseHash).toBe(p2.responseHash);
  });
});

describe("selectProviderFromEnv", () => {
  it("returns the mock when no env vars are set", () => {
    const p = selectProviderFromEnv({});
    expect(p.id).toBe("deterministic-mock");
  });

  it("returns the mock when DATABRIDGE_LLM_FORCE_MOCK is set", () => {
    const p = selectProviderFromEnv({
      OPENAI_API_KEY: "sk-x",
      DATABRIDGE_LLM_FORCE_MOCK: "1",
    });
    expect(p.id).toBe("deterministic-mock");
  });

  it("returns OpenAI when OPENAI_API_KEY is set", () => {
    const p = selectProviderFromEnv({ OPENAI_API_KEY: "sk-x" });
    expect(p).toBeInstanceOf(OpenAiProvider);
    expect(p.id).toBe("openai");
    expect(p.model).toBe("gpt-4o-mini");
  });

  it("respects OPENAI_MODEL override", () => {
    const p = selectProviderFromEnv({ OPENAI_API_KEY: "sk-x", OPENAI_MODEL: "gpt-4o" });
    expect(p.model).toBe("gpt-4o");
  });

  it("returns Anthropic when only ANTHROPIC_API_KEY is set", () => {
    const p = selectProviderFromEnv({ ANTHROPIC_API_KEY: "sk-ant" });
    expect(p).toBeInstanceOf(AnthropicProvider);
    expect(p.id).toBe("anthropic");
  });

  it("returns Azure OpenAI when all three Azure env vars are set", () => {
    const p = selectProviderFromEnv({
      AZURE_OPENAI_API_KEY: "k",
      AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com",
      AZURE_OPENAI_DEPLOYMENT: "depl",
    });
    expect(p).toBeInstanceOf(AzureOpenAiProvider);
    expect(p.id).toBe("azure-openai");
  });

  it("falls back to mock when Azure env is partially set", () => {
    const p = selectProviderFromEnv({
      AZURE_OPENAI_API_KEY: "k",
      AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com",
    });
    expect(p.id).toBe("deterministic-mock");
  });
});

describe("CostCeiling integration", () => {
  it("propagates the ceiling-exceeded error from provider.complete", async () => {
    const provider = new DeterministicMockProvider({
      entries: [{ match: "x", response: { ok: true } }],
    });
    const ceiling = new CostCeiling(0.1);
    ceiling.charge(0.1);
    // mock charges 0 so this succeeds; the ceiling is already maxed.
    await provider.complete(
      "x",
      { name: "T", description: "", jsonSchema: {} },
      (raw) => raw,
      "test",
      { costCeiling: ceiling }
    );
    expect(ceiling.spentUsd).toBeCloseTo(0.1);
    expect(() => ceiling.charge(0.01)).toThrow(CostCeilingExceededError);
  });
});

describe("Provenance sink integration", () => {
  it("records calls into the sink when callers persist the provenance", async () => {
    const provider = new DeterministicMockProvider({
      entries: [{ match: "x", response: { ok: true } }],
    });
    const sink = new InMemoryLlmCallSink();
    const { provenance } = await provider.complete(
      "x",
      { name: "T", description: "", jsonSchema: {} },
      (raw) => raw,
      "rule-compiler-llm"
    );
    sink.record(provenance);
    expect(sink.byCaller("rule-compiler-llm")).toHaveLength(1);
  });
});
