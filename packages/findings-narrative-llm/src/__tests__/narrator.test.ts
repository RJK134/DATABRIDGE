import { describe, it, expect } from "vitest";
import { narrate, defaultBuildPrompt } from "../narrator.js";
import { DeterministicMockProvider } from "@databridge/rule-compiler-llm";
import type { AuditFinding } from "@databridge/rule-core";

const okSlots = {
  headline_sentence: "We found 3 findings.",
  severity_breakdown_bullets: ["CRITICAL: 1", "ERROR: 2"],
  top_cluster_root_cause: "Codeset drift.",
  recommended_next_actions: [{ owner: "Registry", action: "Refresh the codeset.", priority: 1 }],
};

function f(over: Partial<AuditFinding>): AuditFinding {
  return {
    id: "f-1",
    tenantId: "t-1",
    ruleId: "BANNER-NAT-01",
    ruleName: "Codeset drift",
    severity: "ERROR",
    entityType: "BannerStudent",
    subjectId: "p-1",
    message: "x",
    evidence: {},
    status: "new",
    detectedAt: "2026-05-26T00:00:00Z",
    ...over,
  } as AuditFinding;
}

describe("narrate — populated pack", () => {
  it("returns parsed slots + rendered text + provenance", async () => {
    const provider = new DeterministicMockProvider({
      entries: [{ match: "Total findings:", response: okSlots }],
      defaultResponse: okSlots,
    });
    const r = await narrate([f({}), f({ severity: "CRITICAL" })], { provider });
    expect(r.slots.headline_sentence).toBe("We found 3 findings.");
    expect(r.text).toContain("Refresh the codeset.");
    expect(r.markdown).toContain("# Findings narrative");
    expect(r.provenance?.caller).toBe("findings-narrative-llm");
  });

  it("uses the custom prompt builder when supplied", async () => {
    const provider = new DeterministicMockProvider({
      entries: [{ match: "TEST_PROMPT", response: okSlots }],
    });
    const r = await narrate([f({})], {
      provider,
      buildPrompt: () => "TEST_PROMPT",
    });
    expect(r.slots).toBeDefined();
  });

  it("rejects LLM output that violates the slot grammar", async () => {
    const bad = { ...okSlots, severity_breakdown_bullets: [] };
    const provider = new DeterministicMockProvider({
      entries: [{ match: "Total findings:", response: bad }],
      defaultResponse: bad,
    });
    await expect(narrate([f({})], { provider })).rejects.toThrow();
  });

  it("rejects LLM output with markdown smuggled into a slot", async () => {
    const bad = { ...okSlots, headline_sentence: "**bold**" };
    const provider = new DeterministicMockProvider({
      entries: [{ match: "Total findings:", response: bad }],
      defaultResponse: bad,
    });
    await expect(narrate([f({})], { provider })).rejects.toThrow();
  });
});

describe("narrate — empty pack short-circuits", () => {
  it("skips the provider entirely when findings is empty", async () => {
    const provider = new DeterministicMockProvider();
    const r = await narrate([], { provider });
    expect(r.provenance).toBeNull();
    expect(r.text).toContain("No audit findings");
  });

  it("respects a custom emptyNarrative", async () => {
    const provider = new DeterministicMockProvider();
    const r = await narrate([], {
      provider,
      emptyNarrative: {
        headline_sentence: "Clean run.",
        severity_breakdown_bullets: ["Nothing to report."],
        top_cluster_root_cause: "n/a",
        recommended_next_actions: [{ owner: "Ops", action: "Continue monitoring." }],
      },
    });
    expect(r.slots.headline_sentence).toBe("Clean run.");
  });
});

describe("defaultBuildPrompt", () => {
  it("includes severity totals and top rules", () => {
    const prompt = defaultBuildPrompt([
      f({ severity: "CRITICAL", ruleId: "BANNER-NAT-01" }),
      f({ severity: "ERROR", ruleId: "BANNER-NAT-02" }),
      f({ severity: "ERROR", ruleId: "BANNER-NAT-02" }),
    ]);
    expect(prompt).toContain("Total findings: 3");
    expect(prompt).toContain("CRITICAL=1");
    expect(prompt).toContain("ERROR=2");
    expect(prompt).toContain("BANNER-NAT-02:2");
  });
});

describe("narrate — provenance hygiene", () => {
  it("never includes raw finding messages in the provenance record", async () => {
    const provider = new DeterministicMockProvider({
      entries: [{ match: "Total findings:", response: okSlots }],
      defaultResponse: okSlots,
    });
    const finding = f({ message: "Jane Smith DOB 1990-01-01 husid 1234567890123" });
    const r = await narrate([finding], { provider });
    const blob = JSON.stringify(r.provenance);
    expect(blob).not.toContain("Jane Smith");
    expect(blob).not.toContain("1234567890123");
  });
});

describe("narrate — slot length truncation safety", () => {
  it("rejects LLM output where headline exceeds the cap", async () => {
    const bad = { ...okSlots, headline_sentence: "x".repeat(221) };
    const provider = new DeterministicMockProvider({
      entries: [{ match: "Total findings:", response: bad }],
      defaultResponse: bad,
    });
    await expect(narrate([f({})], { provider })).rejects.toThrow();
  });

  it("rejects LLM output where actions array is empty", async () => {
    const bad = { ...okSlots, recommended_next_actions: [] };
    const provider = new DeterministicMockProvider({
      entries: [{ match: "Total findings:", response: bad }],
      defaultResponse: bad,
    });
    await expect(narrate([f({})], { provider })).rejects.toThrow();
  });
});
