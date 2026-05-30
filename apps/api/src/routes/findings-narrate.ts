/**
 * POST /v1/findings/{runId}:narrate
 *
 * Resolves an audit run via the AuditStore, hands its findings to the
 * findings-narrative-llm package, and returns the rendered narrative
 * plus the LlmCallProvenance record. Callers may also POST inline
 * findings (`{ findings: [...] }`) for ad-hoc summaries — used by the
 * demo orchestrator.
 *
 * Provider selection mirrors POST /v1/rules:compile:
 *   - `provider: "mock"` + optional `cannedEntries` → DeterministicMockProvider
 *   - `provider: "auto"` (default) → selectProviderFromEnv (falls back to mock)
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuditFinding } from "@databridge/rule-core";
import { narrate, type NarrativeSlots } from "@databridge/findings-narrative-llm";
import {
  DeterministicMockProvider,
  selectProviderFromEnv,
  type LlmProvider,
} from "@databridge/rule-compiler-llm";
import {
  InMemoryLlmCallSink,
  CostCeiling,
  CostCeilingExceededError,
  type LlmCallProvenance,
} from "@databridge/provenance-core";
import { getActiveAuditStore } from "../audit-store.js";

const sink = new InMemoryLlmCallSink();

export function getFindingsNarrateSink(): InMemoryLlmCallSink {
  return sink;
}

const NarrateBodyZ = z.object({
  provider: z.enum(["mock", "auto"]).optional(),
  costCeilingUsd: z.number().nonnegative().optional(),
  /** Optional inline findings — used when the runId path param is "inline". */
  findings: z.array(z.record(z.unknown())).max(50_000).optional(),
  cannedEntries: z
    .array(
      z.object({
        match: z.string().min(1).max(500),
        response: z.unknown(),
      })
    )
    .max(50)
    .optional(),
});

export const DEFAULT_COST_CEILING_USD = 0.5;

export interface NarrateResponse {
  slots: NarrativeSlots;
  text: string;
  markdown: string;
  /** Null when the empty-pack short-circuit was taken. */
  provenance: LlmCallProvenance | null;
}

export async function findingsNarrateRoutes(app: FastifyInstance): Promise<void> {
  // Fastify treats `:foo` as a param placeholder; URLs with the trailing
  // `:narrate` suffix go through the wildcard form. Both routes resolve to
  // the same handler so callers can use either canonical form.
  const handler = async (
    req: FastifyRequest<{ Params: { runId: string } }>,
    reply: FastifyReply
  ) => {
    const parsed = NarrateBodyZ.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const body = parsed.data;

    let findings: AuditFinding[] = [];
    if (req.params.runId === "inline") {
      findings = (body.findings ?? []) as unknown as AuditFinding[];
    } else {
      const audit = await getActiveAuditStore().get(req.params.runId);
      if (!audit) {
        return reply.code(404).send({ error: "audit_not_found", runId: req.params.runId });
      }
      if (audit.status !== "succeeded" || !audit.report) {
        return reply.code(409).send({
          error: "audit_not_ready",
          status: audit.status,
          runId: req.params.runId,
        });
      }
      findings = audit.report.findings;
    }

    const ceiling = new CostCeiling(body.costCeilingUsd ?? DEFAULT_COST_CEILING_USD);
    const provider = buildProvider(body);

    try {
      const result = await narrate(findings, {
        provider,
        llmOptions: { costCeiling: ceiling },
      });
      if (result.provenance) sink.record(result.provenance);
      const response: NarrateResponse = {
        slots: result.slots,
        text: result.text,
        markdown: result.markdown,
        provenance: result.provenance,
      };
      return reply.code(200).send(response);
    } catch (err) {
      if (err instanceof CostCeilingExceededError) {
        return reply.code(429).send({
          error: "cost_ceiling_exceeded",
          ceilingUsd: err.ceilingUsd,
          spentUsd: err.spentUsd,
        });
      }
      if (
        err instanceof Error &&
        /canned response did not parse|invalid|regex|grammar/i.test(err.message)
      ) {
        return reply.code(422).send({
          error: "narrative_grammar_failed",
          message: err.message,
        });
      }
      throw err;
    }
  };

  // Slash form — primary canonical URL.
  app.post<{ Params: { runId: string } }>("/v1/findings/:runId/narrate", handler);
  // Google-AIP custom-method form `/v1/findings/{runId}:narrate`. Fastify's
  // path-to-regexp doesn't support `:foo:bar` adjacency, so we accept the
  // composite token as one param and split off the trailing `:narrate`.
  app.post<{ Params: { runIdWithSuffix: string } }>(
    "/v1/findings/:runIdWithSuffix",
    async (req, reply) => {
      const token = (req.params as { runIdWithSuffix: string }).runIdWithSuffix;
      if (!token.endsWith(":narrate")) {
        return reply.code(404).send({ error: "not_found" });
      }
      const runId = token.slice(0, -":narrate".length);
      if (!runId) {
        return reply.code(404).send({ error: "not_found" });
      }
      const wrapped: FastifyRequest<{ Params: { runId: string } }> = Object.assign(req, {
        params: { runId },
      });
      return handler(wrapped, reply);
    }
  );
}

function buildProvider(body: z.infer<typeof NarrateBodyZ>): LlmProvider {
  const mode = body.provider ?? "auto";
  if (mode === "mock") {
    return new DeterministicMockProvider({
      entries: (body.cannedEntries ?? []).map((e) => ({ match: e.match, response: e.response })),
    });
  }
  return selectProviderFromEnv(process.env, {
    entries: (body.cannedEntries ?? []).map((e) => ({ match: e.match, response: e.response })),
  });
}
