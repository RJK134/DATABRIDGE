import { describe, it, expect } from "vitest";
import { runLlmWalkthrough, SCRIPTED_PROMPTS } from "../llm-walkthrough.js";
import { DeterministicMockProvider } from "@databridge/rule-compiler-llm";

const mockProvider = (): DeterministicMockProvider =>
  new DeterministicMockProvider({
    entries: SCRIPTED_PROMPTS.map((p) => ({ match: p.nl, response: p.expectedRule })),
    defaultResponse: {
      headline_sentence: "Five demo prompts surfaced findings.",
      severity_breakdown_bullets: ["ERROR findings on CRM consent surfaces."],
      top_cluster_root_cause: "Consent mismatch in Salesforce Contact.",
      recommended_next_actions: [
        { owner: "Registry", action: "Resolve the SITS HUSID gaps.", priority: 1 },
      ],
    },
  });

const fixturesByName: Record<string, Array<Record<string, unknown>>> = {
  "salesforce-edu-westmidlands": [
    {
      Id: "001a",
      Email: "shared.contact@uni.example",
      hed__FERPA__c: "Granted",
      HasOptedOutOfEmail: false,
    },
    {
      Id: "001b",
      Email: "shared.contact@uni.example",
      hed__FERPA__c: "Withheld",
      HasOptedOutOfEmail: false,
    },
    {
      Id: "001c",
      Email: "alice@uni.example",
      hed__FERPA__c: "Withheld",
      HasOptedOutOfEmail: false,
    },
    { Id: "001d", Email: "bob@uni.example", hed__FERPA__c: "Granted", HasOptedOutOfEmail: true },
  ],
  "banner-r2t-2024": [
    { SPRIDEN_PIDM: 1, SGBSTDN_MAJR_CODE_1: "XX_LEGACY" },
    { SPRIDEN_PIDM: 2, SGBSTDN_MAJR_CODE_1: "CS" },
    { SPRIDEN_PIDM: 3, SGBSTDN_MAJR_CODE_1: "XX_LEGACY" },
  ],
  "sits-southcoast-2024": [
    { STU_CODE: "S1", STU_HUSID: null },
    { STU_CODE: "S2", STU_HUSID: "1234567890123" },
  ],
  "dynamics365-edu-northpennines": [
    { contactid: "c1", donotbulkemail: true },
    { contactid: "c2", donotbulkemail: false },
  ],
};

describe("SCRIPTED_PROMPTS catalogue", () => {
  it("exposes exactly 5 scripted prompts", () => {
    expect(SCRIPTED_PROMPTS).toHaveLength(5);
  });

  it("covers every Phase A demo fixture", () => {
    const fixtures = new Set(SCRIPTED_PROMPTS.map((p) => p.fixture));
    expect(fixtures.has("salesforce-edu-westmidlands")).toBe(true);
    expect(fixtures.has("banner-r2t-2024")).toBe(true);
    expect(fixtures.has("sits-southcoast-2024")).toBe(true);
    expect(fixtures.has("dynamics365-edu-northpennines")).toBe(true);
  });

  it("every prompt's expected rule has the required grammar fields", () => {
    for (const p of SCRIPTED_PROMPTS) {
      expect(p.expectedRule).toHaveProperty("entity");
      expect(p.expectedRule).toHaveProperty("severity");
      expect(p.expectedRule).toHaveProperty("where");
    }
  });
});

describe("runLlmWalkthrough", () => {
  it("returns one result per scripted prompt", async () => {
    const out = await runLlmWalkthrough({ fixturesByName, provider: mockProvider() });
    expect(out.prompts).toHaveLength(5);
  });

  it("emits provenance prefixes (hashes only — never raw prompts)", async () => {
    const out = await runLlmWalkthrough({ fixturesByName, provider: mockProvider() });
    for (const p of out.prompts) {
      expect(p.promptHashPrefix).toMatch(/^[0-9a-f]{12}$/);
      expect(p.responseHashPrefix).toMatch(/^[0-9a-f]{12}$/);
      expect(p.provider).toBe("deterministic-mock");
      expect(p.costUsd).toBe(0);
    }
  });

  it("flags 2 of 4 contacts on the shared-email prompt", async () => {
    const out = await runLlmWalkthrough({ fixturesByName, provider: mockProvider() });
    const sf = out.prompts.find((p) => p.id === "demo-01");
    expect(sf?.findings).toBe(2);
  });

  it("flags 2 of 4 contacts on the FERPA-mismatch prompt", async () => {
    const out = await runLlmWalkthrough({ fixturesByName, provider: mockProvider() });
    const ferpa = out.prompts.find((p) => p.id === "demo-02");
    expect(ferpa?.findings).toBe(2);
  });

  it("flags 2 of 3 banner students on the XX_LEGACY prompt", async () => {
    const out = await runLlmWalkthrough({ fixturesByName, provider: mockProvider() });
    const banner = out.prompts.find((p) => p.id === "demo-03");
    expect(banner?.findings).toBe(2);
  });

  it("flags 1 of 2 SITS rows on the missing-HUSID prompt", async () => {
    const out = await runLlmWalkthrough({ fixturesByName, provider: mockProvider() });
    const sits = out.prompts.find((p) => p.id === "demo-04");
    expect(sits?.findings).toBe(1);
  });

  it("flags 1 of 2 Dataverse rows on the donotbulkemail prompt", async () => {
    const out = await runLlmWalkthrough({ fixturesByName, provider: mockProvider() });
    const dv = out.prompts.find((p) => p.id === "demo-05");
    expect(dv?.findings).toBe(1);
  });

  it("emits a templated narrative summary", async () => {
    const out = await runLlmWalkthrough({ fixturesByName, provider: mockProvider() });
    expect(out.narrative).toBeDefined();
    expect(out.narrative?.headline.length).toBeGreaterThan(0);
    expect(out.narrative?.actionsCount).toBeGreaterThanOrEqual(1);
  });

  it("does not throw when a fixture is missing — rows default to 0", async () => {
    const partial: typeof fixturesByName = {
      "salesforce-edu-westmidlands": fixturesByName["salesforce-edu-westmidlands"]!,
    };
    const out = await runLlmWalkthrough({ fixturesByName: partial, provider: mockProvider() });
    const banner = out.prompts.find((p) => p.id === "demo-03");
    expect(banner?.rowsScanned).toBe(0);
    expect(banner?.findings).toBe(0);
  });
});
