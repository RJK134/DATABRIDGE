/**
 * @databridge/rule-compiler-llm
 *
 * Translate natural-language prompts ("how many 2024/25 entrants are
 * missing a programme of study?") into validated, grammar-constrained
 * rules ready for the deterministic engine to execute.
 *
 * The LLM is constrained to a fixed JSON shape (`LlmRule`). A
 * deterministic compiler validates the shape, runs static safety
 * checks, verifies every field reference against the dictionary, and
 * returns a `CompiledRule` plus an `LlmCallProvenance` record. The
 * compiler never executes free SQL, never accepts free SQL from the
 * LLM, and never invokes anything outside its strict grammar.
 */
export * from "./rule-grammar.js";
export * from "./dictionary.js";
export * from "./provider.js";
export * from "./compiler.js";

import { LlmRuleZ, type LlmRule } from "./rule-grammar.js";
import {
  compileLlmRule,
  type CompiledRule,
  type CompileOptions,
  RuleCompilerError,
} from "./compiler.js";
import { type LlmProvider, type LlmCallOptions } from "./provider.js";
import { DEMO_DICTIONARY, type RuleDictionary } from "./dictionary.js";
import type { LlmCallProvenance } from "@databridge/provenance-core";

/** JSON Schema description sent to real providers. */
export const RULE_GRAMMAR_SCHEMA = {
  name: "DatabridgeRule",
  description:
    "A grammar-constrained DATABRIDGE rule definition. The LLM may only emit predicates / and / or / not clauses referencing dictionary fields. No SQL, no markdown, no joins.",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    required: ["id", "entity", "name", "description", "severity", "messageTemplate", "where"],
    properties: {
      id: { type: "string", maxLength: 64, pattern: "^[A-Za-z0-9._-]+$" },
      entity: { type: "string", maxLength: 64 },
      name: { type: "string", maxLength: 120 },
      description: { type: "string", maxLength: 500 },
      severity: { type: "string", enum: ["CRITICAL", "ERROR", "WARN", "INFO"] },
      tags: { type: "array", items: { type: "string", maxLength: 32 }, maxItems: 16 },
      messageTemplate: { type: "string", maxLength: 400 },
      where: { $ref: "#/$defs/Clause" },
    },
    $defs: {
      Clause: {
        oneOf: [
          { $ref: "#/$defs/Predicate" },
          { $ref: "#/$defs/And" },
          { $ref: "#/$defs/Or" },
          { $ref: "#/$defs/Not" },
        ],
      },
      Predicate: {
        type: "object",
        required: ["kind", "op", "field", "operands"],
        properties: {
          kind: { const: "predicate" },
          op: {
            type: "string",
            enum: [
              "eq",
              "neq",
              "in",
              "notIn",
              "isNull",
              "isNotNull",
              "gt",
              "lt",
              "gte",
              "lte",
              "between",
              "matches",
            ],
          },
          field: { $ref: "#/$defs/FieldRef" },
          operands: { type: "array", maxItems: 8, items: { $ref: "#/$defs/Operand" } },
        },
      },
      FieldRef: {
        type: "object",
        required: ["kind", "entity", "field"],
        properties: {
          kind: { const: "field" },
          entity: { type: "string" },
          field: { type: "string" },
        },
      },
      Operand: {
        oneOf: [
          { $ref: "#/$defs/FieldRef" },
          {
            type: "object",
            required: ["kind", "value"],
            properties: {
              kind: { const: "literal" },
              value: {
                anyOf: [
                  { type: "string", maxLength: 200 },
                  { type: "number" },
                  { type: "boolean" },
                  { type: "null" },
                ],
              },
            },
          },
        ],
      },
      And: {
        type: "object",
        required: ["kind", "clauses"],
        properties: {
          kind: { const: "and" },
          clauses: { type: "array", items: { $ref: "#/$defs/Clause" } },
        },
      },
      Or: {
        type: "object",
        required: ["kind", "clauses"],
        properties: {
          kind: { const: "or" },
          clauses: { type: "array", items: { $ref: "#/$defs/Clause" } },
        },
      },
      Not: {
        type: "object",
        required: ["kind", "clause"],
        properties: { kind: { const: "not" }, clause: { $ref: "#/$defs/Clause" } },
      },
    },
  },
} as const;

const CALLER_SURFACE = "rule-compiler-llm";

export interface CompileNlOptions {
  provider: LlmProvider;
  dictionary?: RuleDictionary;
  /** Optional per-call options (cost ceiling, tags, …). */
  llmOptions?: LlmCallOptions;
  /** Override the prompt builder — tests inject a fixture-friendly one. */
  buildPrompt?: (nl: string, dict: RuleDictionary) => string;
  /** Override the id prefix. */
  idPrefix?: string;
  /**
   * Optional dataset hook — when provided, the compiler dry-runs the
   * compiled rule against the bound rows and returns the finding count.
   */
  dataset?: ReadonlyArray<Record<string, unknown>>;
}

export interface CompileNlResult {
  rule: CompiledRule;
  /** Raw grammar-validated `LlmRule` — useful for inspection / round-trip. */
  llmRule: LlmRule;
  provenance: LlmCallProvenance;
  /** Number of findings if the caller bound a dataset. */
  dryRunFindings?: number;
}

export async function compileNlToRule(
  nl: string,
  options: CompileNlOptions
): Promise<CompileNlResult> {
  const dict = options.dictionary ?? DEMO_DICTIONARY;
  const prompt = (options.buildPrompt ?? defaultBuildPrompt)(nl, dict);
  const { output, provenance } = await options.provider.complete<LlmRule>(
    prompt,
    RULE_GRAMMAR_SCHEMA,
    (raw) => LlmRuleZ.parse(raw),
    CALLER_SURFACE,
    options.llmOptions
  );
  const compileOpts: CompileOptions = {
    dictionary: dict,
  };
  if (options.idPrefix !== undefined) compileOpts.idPrefix = options.idPrefix;
  const rule = compileLlmRule(output, compileOpts);
  const result: CompileNlResult = {
    rule,
    llmRule: output,
    provenance,
  };
  if (options.dataset) {
    let n = 0;
    for (const row of options.dataset) {
      if (rule.evaluate(row)) n += 1;
    }
    result.dryRunFindings = n;
  }
  return result;
}

/** Default prompt builder — concise English that surfaces the grammar. */
export function defaultBuildPrompt(nl: string, dict: RuleDictionary): string {
  const entities = new Set(dict.fields.map((f) => f.entity));
  const fieldList = dict.fields
    .map((f) => `${f.entity}.${f.field}${f.codelistId ? ` (codelist:${f.codelistId})` : ""}`)
    .join(", ");
  return [
    "You are the DATABRIDGE rule compiler. Translate the user's natural-language",
    "request into the JSON grammar (no SQL, no joins, no markdown). The rule's",
    "`entity` MUST be one of the listed entities; every `field` MUST appear in",
    "the dictionary. Respond ONLY with valid JSON matching the schema.",
    "",
    `Entities: ${[...entities].join(", ")}`,
    `Dictionary fields: ${fieldList}`,
    "",
    `Request: ${nl}`,
  ].join("\n");
}

export { RuleCompilerError };
