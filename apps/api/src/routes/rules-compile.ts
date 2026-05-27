/**
 * POST /v1/rules:compile
 *
 * Accepts a natural-language request, compiles it into a grammar-
 * constrained rule, and returns the rule plus the LLM provenance. If a
 * dataset is bound on the request, the compiled rule is dry-run against
 * it and the finding count is returned.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  compileNlToRule,
  DEMO_DICTIONARY,
  DeterministicMockProvider,
  RuleCompilerError,
  selectProviderFromEnv,
  type LlmProvider,
  type RuleDictionary,
} from "@databridge/rule-compiler-llm";
import {
  InMemoryLlmCallSink,
  CostCeiling,
  CostCeilingExceededError,
  type LlmCallProvenance,
} from "@databridge/provenance-core";

/** Shared sink — production wires this to the AuditStore. */
const sink = new InMemoryLlmCallSink();

/** Expose the sink for tests. */
export function getRuleCompileSink(): InMemoryLlmCallSink {
  return sink;
}

const CompileBodyZ = z.object({
  nl: z.string().min(1).max(2_000),
  /** Optional canned-response provider — tests + the demo wire this. */
  provider: z.enum(["mock", "auto"]).optional(),
  /** Per-call cost ceiling override (defaults to $0.50 per the brief). */
  costCeilingUsd: z.number().nonnegative().optional(),
  /** Optional dataset for a dry-run. */
  dataset: z.array(z.record(z.unknown())).max(50_000).optional(),
  /** Optional dictionary override. */
  dictionary: z
    .object({
      fields: z
        .array(
          z.object({
            entity: z.string(),
            field: z.string(),
            type: z.string().optional(),
            codelistId: z.string().optional(),
          }),
        )
        .max(2_000),
    })
    .optional(),
  /** Optional canned entries to feed the mock provider — used by tests. */
  cannedEntries: z
    .array(
      z.object({
        match: z.string().min(1).max(500),
        response: z.unknown(),
      }),
    )
    .max(50)
    .optional(),
});

export const DEFAULT_COST_CEILING_USD = 0.5;

export interface RuleCompileResponse {
  rule: {
    id: string;
    entity: string;
    name: string;
    description: string;
    severity: string;
    tags: readonly string[];
    messageTemplate: string;
    fieldsRead: readonly { entity: string; field: string }[];
  };
  provenance: LlmCallProvenance;
  dryRunFindings?: number;
}

export async function rulesCompileRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/rules:compile", async (req, reply) => {
    const parsed = CompileBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const body = parsed.data;
    const dictionary: RuleDictionary = body.dictionary
      ? {
          fields: body.dictionary.fields.map((f) => {
            const entry: { entity: string; field: string; type?: string; codelistId?: string } = {
              entity: f.entity,
              field: f.field,
            };
            if (f.type !== undefined) entry.type = f.type;
            if (f.codelistId !== undefined) entry.codelistId = f.codelistId;
            return entry;
          }),
        }
      : DEMO_DICTIONARY;
    const ceiling = new CostCeiling(body.costCeilingUsd ?? DEFAULT_COST_CEILING_USD);

    const provider = buildProvider(body);

    try {
      const result = await compileNlToRule(body.nl, {
        provider,
        dictionary,
        llmOptions: { costCeiling: ceiling },
        idPrefix: "nl",
        ...(body.dataset ? { dataset: body.dataset } : {}),
      });
      sink.record(result.provenance);
      const response: RuleCompileResponse = {
        rule: {
          id: result.rule.id,
          entity: result.rule.entity,
          name: result.rule.name,
          description: result.rule.description,
          severity: result.rule.severity,
          tags: result.rule.tags,
          messageTemplate: result.rule.messageTemplate,
          fieldsRead: result.rule.fieldsRead.map((f) => ({ entity: f.entity, field: f.field })),
        },
        provenance: result.provenance,
      };
      if (result.dryRunFindings !== undefined) response.dryRunFindings = result.dryRunFindings;
      return reply.code(200).send(response);
    } catch (err) {
      if (err instanceof RuleCompilerError) {
        return reply.code(422).send({
          error: "rule_compile_failed",
          code: err.code,
          message: err.message,
          details: err.details ?? null,
        });
      }
      if (err instanceof CostCeilingExceededError) {
        return reply.code(429).send({
          error: "cost_ceiling_exceeded",
          ceilingUsd: err.ceilingUsd,
          spentUsd: err.spentUsd,
        });
      }
      // Provider errors that wrap a grammar-parse failure also surface as
      // 422 rule_compile_failed — they originate from the LLM emitting a
      // shape that doesn't match `LlmRuleZ`.
      if (
        err instanceof Error &&
        /canned response did not parse|json_schema|grammar/i.test(err.message)
      ) {
        return reply.code(422).send({
          error: "rule_compile_failed",
          code: "GRAMMAR",
          message: err.message,
        });
      }
      throw err;
    }
  });
}

function buildProvider(body: z.infer<typeof CompileBodyZ>): LlmProvider {
  const mode = body.provider ?? "auto";
  if (mode === "mock") {
    return new DeterministicMockProvider({
      entries: (body.cannedEntries ?? []).map((e) => ({ match: e.match, response: e.response })),
    });
  }
  // "auto" — env-driven; tests run with no env vars so this returns the mock.
  return selectProviderFromEnv(process.env, {
    entries: (body.cannedEntries ?? []).map((e) => ({ match: e.match, response: e.response })),
  });
}
