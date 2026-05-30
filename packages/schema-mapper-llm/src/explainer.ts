/**
 * Build a 2-3 sentence rationale for an LLM-ranked schema suggestion.
 *
 * The explainer is grammar-constrained the same way the rule-compiler
 * is: the LLM returns a strict shape (`chosen: string`, `rationale:
 * string[]`, `confidence: number`) — never freeform paragraphs. The
 * length and character set of the rationale are bounded.
 */
import { z } from "zod";
import {
  type LlmProvider,
  type LlmCallOptions,
  type OutputSchema,
} from "@databridge/rule-compiler-llm";
import type { LlmCallProvenance } from "@databridge/provenance-core";

/** Allowed character set in rationale sentences. Letters, digits,
 *  whitespace, basic punctuation. No HTML, no markdown, no SQL. */
const RATIONALE_RE = /^[A-Za-z0-9 .,;:'"()/\-_+@%]*$/;

export const ExplanationZ = z.object({
  chosen: z.string().min(1).max(120),
  /** Up to 3 sentences, each ≤ 160 chars. */
  rationale: z.array(z.string().min(1).max(160).regex(RATIONALE_RE)).min(1).max(3),
  /** Model's stated confidence, clipped to [0, 1] downstream. */
  confidence: z.number().min(0).max(1),
});

export type Explanation = z.infer<typeof ExplanationZ>;

export const EXPLANATION_SCHEMA: OutputSchema = {
  name: "DatabridgeMappingExplanation",
  description:
    "A schema-mapping tie-breaker explanation. The LLM ranks the deterministic candidates and returns the chosen canonical field plus up to 3 short rationale sentences. No SQL, no markdown.",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    required: ["chosen", "rationale", "confidence"],
    properties: {
      chosen: { type: "string", maxLength: 120 },
      rationale: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: { type: "string", maxLength: 160 },
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
  },
};

export interface ExplainSuggestionInput {
  sourceColumn: string;
  candidates: ReadonlyArray<{
    canonical: string;
    entity: string;
    score: number;
    rationale: string;
  }>;
  /** Optional brief contextual hint — e.g. "tenant uses Banner-Oracle". */
  context?: string;
}

export interface ExplainSuggestionResult {
  explanation: Explanation;
  provenance: LlmCallProvenance;
}

const CALLER = "schema-mapper-llm/explainer";

export async function explainSuggestion(
  input: ExplainSuggestionInput,
  provider: LlmProvider,
  llmOptions?: LlmCallOptions
): Promise<ExplainSuggestionResult> {
  const prompt = buildExplainerPrompt(input);
  const { output, provenance } = await provider.complete<Explanation>(
    prompt,
    EXPLANATION_SCHEMA,
    (raw) => ExplanationZ.parse(raw),
    CALLER,
    llmOptions
  );
  return { explanation: output, provenance };
}

export function buildExplainerPrompt(input: ExplainSuggestionInput): string {
  const candidateList = input.candidates
    .map((c) => `- ${c.entity}.${c.canonical} (score ${c.score.toFixed(2)}): ${c.rationale}`)
    .join("\n");
  return [
    "You are the DATABRIDGE schema-mapping tie-breaker. The deterministic",
    "suggester returned the candidates below — pick the best canonical match",
    "for the source column and explain in 2-3 short sentences. Output JSON",
    "matching the schema. No markdown, no SQL.",
    "",
    `Source column: ${input.sourceColumn}`,
    "Candidates:",
    candidateList,
    "",
    input.context ? `Context: ${input.context}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Compose the candidate set's rationale into a stable plain-text blob. */
export function explanationToText(e: Explanation): string {
  return e.rationale.join(" ");
}
