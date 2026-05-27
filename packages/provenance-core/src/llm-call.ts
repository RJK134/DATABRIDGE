/**
 * LLM call provenance record.
 *
 * Phase B requirement (non-negotiable): every LLM call emitted by the
 * `@databridge/rule-compiler-llm`, `@databridge/schema-mapper-llm`, and
 * `@databridge/findings-narrative-llm` packages MUST emit one of these
 * records and persist it via the in-process audit store before the
 * caller sees the result.
 *
 * The record carries hashes — NOT raw prompt/response text — so PII
 * never leaks into the audit log by default. Callers may set
 * `redactedPromptPreview` to a short, PII-redacted excerpt for
 * operator-facing UI; the raw prompt itself must not be stored.
 */
import { createHash, randomUUID } from "node:crypto";

/**
 * Provenance record emitted for every LLM call. The shape is stable and
 * versioned so downstream readers (audit ingesters, the demo dashboard,
 * Phase D compliance exporters) can rely on it.
 */
export interface LlmCallProvenance {
  /** Unique id for this call. */
  callId: string;
  /** ISO-8601 timestamp when the call started. */
  timestamp: string;
  /** Caller surface — e.g. "rule-compiler-llm", "schema-mapper-llm". */
  caller: string;
  /** Provider identifier — e.g. "openai", "anthropic", "azure-openai", "deterministic-mock". */
  provider: string;
  /** Model identifier as understood by the provider — e.g. "gpt-4o-mini". */
  model: string;
  /** sha256(prompt) — never the raw prompt by default. */
  promptHash: string;
  /** sha256(JSON.stringify(response)) — never the raw response by default. */
  responseHash: string;
  /** End-to-end latency in milliseconds. */
  latencyMs: number;
  /** Token counts when the provider reports them. */
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
  };
  /** Estimated dollar cost when the provider reports it. */
  costUsd?: number;
  /** Optional short, PII-redacted preview of the prompt for operator UI. */
  redactedPromptPreview?: string;
  /** Optional structured tags — schema name, tenant id, rule id, etc. */
  tags?: Record<string, string>;
}

/** Compute a sha256 over an arbitrary string. */
export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Compute a sha256 over an arbitrary JSON-serialisable value. */
export function sha256Json(v: unknown): string {
  return sha256Hex(stableStringify(v));
}

/** Stable JSON stringification — sorts object keys recursively. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) {
    return `[${v.map(stableStringify).join(",")}]`;
  }
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/**
 * Build a provenance record for an LLM call. The caller supplies the
 * raw prompt + response so we can hash them; we never store either.
 */
export interface BuildLlmCallProvenanceInput {
  caller: string;
  provider: string;
  model: string;
  prompt: string;
  response: unknown;
  latencyMs: number;
  tokens?: LlmCallProvenance["tokens"];
  costUsd?: number;
  redactedPromptPreview?: string;
  tags?: Record<string, string>;
  /** Override timestamp (tests). Default Date.now(). */
  now?: () => Date;
  /** Override callId (tests). Default randomUUID(). */
  callId?: string;
}

export function buildLlmCallProvenance(
  input: BuildLlmCallProvenanceInput,
): LlmCallProvenance {
  const now = (input.now ?? (() => new Date()))();
  const rec: LlmCallProvenance = {
    callId: input.callId ?? randomUUID(),
    timestamp: now.toISOString(),
    caller: input.caller,
    provider: input.provider,
    model: input.model,
    promptHash: sha256Hex(input.prompt),
    responseHash: sha256Json(input.response),
    latencyMs: input.latencyMs,
  };
  if (input.tokens) rec.tokens = input.tokens;
  if (input.costUsd !== undefined) rec.costUsd = input.costUsd;
  if (input.redactedPromptPreview) rec.redactedPromptPreview = input.redactedPromptPreview;
  if (input.tags) rec.tags = input.tags;
  return rec;
}

/**
 * In-memory sink for provenance records. Production deployments back
 * this with the AuditStore; the in-memory sink is sufficient for tests
 * and demo runs.
 */
export class InMemoryLlmCallSink {
  private readonly records: LlmCallProvenance[] = [];

  record(p: LlmCallProvenance): void {
    this.records.push(p);
  }

  list(): readonly LlmCallProvenance[] {
    return this.records;
  }

  byCaller(caller: string): readonly LlmCallProvenance[] {
    return this.records.filter((r) => r.caller === caller);
  }

  clear(): void {
    this.records.length = 0;
  }
}

/**
 * Cost ceiling helper. Tracks cumulative spend per run and throws a
 * structured error when the configured ceiling is exceeded.
 */
export class CostCeiling {
  private spent = 0;

  constructor(public readonly ceilingUsd: number) {
    if (!(ceilingUsd >= 0)) {
      throw new Error("CostCeiling: ceilingUsd must be non-negative");
    }
  }

  /** Current cumulative spend in USD. */
  get spentUsd(): number {
    return this.spent;
  }

  /** Remaining budget. */
  get remainingUsd(): number {
    return Math.max(0, this.ceilingUsd - this.spent);
  }

  /**
   * Record a charge. Throws `CostCeilingExceededError` if the new total
   * would exceed the ceiling. Zero-cost charges (mock provider) always
   * succeed.
   */
  charge(costUsd: number): void {
    if (costUsd < 0) {
      throw new Error("CostCeiling.charge: negative cost");
    }
    if (this.spent + costUsd > this.ceilingUsd) {
      throw new CostCeilingExceededError(
        `cost ceiling exceeded: would spend $${(this.spent + costUsd).toFixed(4)} of $${this.ceilingUsd.toFixed(4)}`,
        this.ceilingUsd,
        this.spent,
        costUsd,
      );
    }
    this.spent += costUsd;
  }
}

export class CostCeilingExceededError extends Error {
  readonly code = "COST_CEILING_EXCEEDED";

  constructor(
    message: string,
    readonly ceilingUsd: number,
    readonly spentUsd: number,
    readonly attemptedUsd: number,
  ) {
    super(message);
    this.name = "CostCeilingExceededError";
  }
}
