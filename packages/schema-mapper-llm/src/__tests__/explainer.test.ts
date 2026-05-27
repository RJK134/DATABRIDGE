import { describe, it, expect } from "vitest";
import {
  EXPLANATION_SCHEMA,
  ExplanationZ,
  buildExplainerPrompt,
  explainSuggestion,
  explanationToText,
} from "../explainer.js";
import { DeterministicMockProvider } from "@databridge/rule-compiler-llm";

const okExplanation = {
  chosen: "lastName",
  rationale: ["SPRIDEN_LAST_NAME is the Banner surname column.", "Tokens match closely."],
  confidence: 0.9,
};

describe("ExplanationZ", () => {
  it("accepts a valid explanation", () => {
    expect(() => ExplanationZ.parse(okExplanation)).not.toThrow();
  });

  it("rejects empty rationale arrays", () => {
    expect(() => ExplanationZ.parse({ ...okExplanation, rationale: [] })).toThrow();
  });

  it("rejects rationale sentences with HTML / markdown", () => {
    expect(() =>
      ExplanationZ.parse({ ...okExplanation, rationale: ["<script>alert(1)</script>"] }),
    ).toThrow();
    expect(() =>
      ExplanationZ.parse({ ...okExplanation, rationale: ["**bold**"] }),
    ).toThrow();
  });

  it("rejects confidence outside [0, 1]", () => {
    expect(() => ExplanationZ.parse({ ...okExplanation, confidence: -0.1 })).toThrow();
    expect(() => ExplanationZ.parse({ ...okExplanation, confidence: 1.1 })).toThrow();
  });

  it("rejects rationale longer than 160 chars per sentence", () => {
    expect(() =>
      ExplanationZ.parse({
        ...okExplanation,
        rationale: ["x".repeat(200)],
      }),
    ).toThrow();
  });
});

describe("buildExplainerPrompt", () => {
  it("includes the source column and every candidate", () => {
    const prompt = buildExplainerPrompt({
      sourceColumn: "SPRIDEN_LAST_NAME",
      candidates: [
        { canonical: "lastName", entity: "Student", score: 0.7, rationale: "exact token" },
        { canonical: "firstName", entity: "Student", score: 0.3, rationale: "token overlap" },
      ],
    });
    expect(prompt).toContain("SPRIDEN_LAST_NAME");
    expect(prompt).toContain("Student.lastName");
    expect(prompt).toContain("Student.firstName");
  });

  it("appends context when supplied", () => {
    const prompt = buildExplainerPrompt({
      sourceColumn: "x",
      candidates: [{ canonical: "y", entity: "Student", score: 0.5, rationale: "r" }],
      context: "tenant uses Banner-Oracle",
    });
    expect(prompt).toContain("Banner-Oracle");
  });
});

describe("explainSuggestion", () => {
  it("returns a parsed explanation plus provenance", async () => {
    const provider = new DeterministicMockProvider({
      entries: [{ match: "SPRIDEN_LAST_NAME", response: okExplanation }],
    });
    const result = await explainSuggestion(
      {
        sourceColumn: "SPRIDEN_LAST_NAME",
        candidates: [
          { canonical: "lastName", entity: "Student", score: 0.5, rationale: "r" },
        ],
      },
      provider,
    );
    expect(result.explanation.chosen).toBe("lastName");
    expect(result.provenance.caller).toBe("schema-mapper-llm/explainer");
    expect(result.provenance.provider).toBe("deterministic-mock");
  });
});

describe("explanationToText", () => {
  it("joins rationale sentences with single spaces", () => {
    expect(
      explanationToText({
        chosen: "x",
        rationale: ["one.", "two."],
        confidence: 0.5,
      }),
    ).toBe("one. two.");
  });
});

describe("EXPLANATION_SCHEMA", () => {
  it("exposes a JSON Schema with the required properties", () => {
    expect(EXPLANATION_SCHEMA.jsonSchema).toMatchObject({
      type: "object",
      required: ["chosen", "rationale", "confidence"],
    });
  });
});
