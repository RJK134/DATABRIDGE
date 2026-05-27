import { describe, it, expect } from "vitest";
import {
  buildLlmCallProvenance,
  sha256Hex,
  sha256Json,
  stableStringify,
  InMemoryLlmCallSink,
  CostCeiling,
  CostCeilingExceededError,
} from "../llm-call.js";

describe("sha256Hex / sha256Json / stableStringify", () => {
  it("hashes a known string deterministically", () => {
    expect(sha256Hex("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("sha256Json sorts object keys deterministically", () => {
    const a = { b: 1, a: 2 };
    const b = { a: 2, b: 1 };
    expect(sha256Json(a)).toBe(sha256Json(b));
  });

  it("stableStringify handles nested arrays and objects", () => {
    expect(stableStringify({ b: [1, { y: 2, x: 1 }], a: 3 })).toBe(
      '{"a":3,"b":[1,{"x":1,"y":2}]}',
    );
  });

  it("stableStringify handles null + primitive values", () => {
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(42)).toBe("42");
    expect(stableStringify("x")).toBe('"x"');
  });
});

describe("buildLlmCallProvenance", () => {
  it("populates the required fields", () => {
    const p = buildLlmCallProvenance({
      caller: "rule-compiler-llm",
      provider: "deterministic-mock",
      model: "mock-1",
      prompt: "find me orphans",
      response: { rule: { id: "R1" } },
      latencyMs: 12,
      now: () => new Date("2026-05-26T00:00:00Z"),
      callId: "fixed",
    });
    expect(p.callId).toBe("fixed");
    expect(p.timestamp).toBe("2026-05-26T00:00:00.000Z");
    expect(p.caller).toBe("rule-compiler-llm");
    expect(p.provider).toBe("deterministic-mock");
    expect(p.model).toBe("mock-1");
    expect(p.latencyMs).toBe(12);
    expect(p.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.responseHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("omits optional fields when not provided (exactOptionalPropertyTypes)", () => {
    const p = buildLlmCallProvenance({
      caller: "x",
      provider: "y",
      model: "z",
      prompt: "p",
      response: {},
      latencyMs: 0,
    });
    expect("tokens" in p).toBe(false);
    expect("costUsd" in p).toBe(false);
  });

  it("includes optional fields when provided", () => {
    const p = buildLlmCallProvenance({
      caller: "x",
      provider: "y",
      model: "z",
      prompt: "p",
      response: {},
      latencyMs: 0,
      tokens: { input: 10, output: 5, total: 15 },
      costUsd: 0.0001,
      redactedPromptPreview: "<student name redacted>",
      tags: { tenantId: "t-1" },
    });
    expect(p.tokens?.input).toBe(10);
    expect(p.costUsd).toBeCloseTo(0.0001);
    expect(p.redactedPromptPreview).toContain("redacted");
    expect(p.tags?.["tenantId"]).toBe("t-1");
  });

  it("never embeds the raw prompt text", () => {
    const p = buildLlmCallProvenance({
      caller: "x",
      provider: "y",
      model: "z",
      prompt: "Jane Smith DOB 1990-01-01 husid 1234567890123",
      response: {},
      latencyMs: 0,
    });
    expect(JSON.stringify(p)).not.toContain("Jane Smith");
    expect(JSON.stringify(p)).not.toContain("1234567890123");
  });
});

describe("InMemoryLlmCallSink", () => {
  it("records and lists calls", () => {
    const sink = new InMemoryLlmCallSink();
    const p1 = buildLlmCallProvenance({
      caller: "rule-compiler-llm",
      provider: "mock",
      model: "m",
      prompt: "a",
      response: {},
      latencyMs: 1,
    });
    const p2 = buildLlmCallProvenance({
      caller: "schema-mapper-llm",
      provider: "mock",
      model: "m",
      prompt: "b",
      response: {},
      latencyMs: 1,
    });
    sink.record(p1);
    sink.record(p2);
    expect(sink.list()).toHaveLength(2);
    expect(sink.byCaller("rule-compiler-llm")).toHaveLength(1);
    sink.clear();
    expect(sink.list()).toHaveLength(0);
  });
});

describe("CostCeiling", () => {
  it("permits charges up to the ceiling", () => {
    const c = new CostCeiling(0.5);
    c.charge(0.2);
    c.charge(0.3);
    expect(c.spentUsd).toBeCloseTo(0.5);
    expect(c.remainingUsd).toBe(0);
  });

  it("rejects a charge that would exceed the ceiling", () => {
    const c = new CostCeiling(0.5);
    c.charge(0.4);
    expect(() => c.charge(0.2)).toThrow(CostCeilingExceededError);
    expect(c.spentUsd).toBeCloseTo(0.4);
  });

  it("permits zero-cost charges always", () => {
    const c = new CostCeiling(0);
    c.charge(0);
    c.charge(0);
    expect(c.spentUsd).toBe(0);
  });

  it("rejects negative charges", () => {
    const c = new CostCeiling(1);
    expect(() => c.charge(-0.1)).toThrow();
  });

  it("rejects negative ceilings on construction", () => {
    expect(() => new CostCeiling(-1)).toThrow();
  });
});
