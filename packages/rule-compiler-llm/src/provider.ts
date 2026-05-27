/**
 * LlmProvider — the narrow, structured-output-only LLM interface used
 * across Phase B packages. Implementations:
 *
 *   - DeterministicMockProvider — default in tests and the demo;
 *     maps prompts to canned outputs. Never fails. Costs $0.
 *   - OpenAiProvider — OpenAI Chat Completions with `response_format`
 *     pinned to a JSON schema. Peer-optional.
 *   - AnthropicProvider — Anthropic Messages with `tool_use` forcing
 *     a JSON-schema-validated output. Peer-optional.
 *   - AzureOpenAiProvider — Azure-hosted OpenAI variant. Peer-optional.
 *
 * Provenance is enforced at this layer: every call returns the result
 * AND a `provenance` record so callers cannot bypass the audit log.
 * Cost ceilings are also enforced here.
 */
import {
  buildLlmCallProvenance,
  CostCeiling,
  CostCeilingExceededError,
  type LlmCallProvenance,
} from "@databridge/provenance-core";

/** A JSON-schema-shaped output spec. Providers should pass it to the
 *  model verbatim so the structured-output mode kicks in. */
export interface OutputSchema {
  /** Logical name (sent to the provider as `schema.name`). */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Plain JSON Schema describing the expected output. */
  jsonSchema: Record<string, unknown>;
}

/** Per-call options. */
export interface LlmCallOptions {
  /** Optional CostCeiling — defaults to one-call-no-cap if omitted. */
  costCeiling?: CostCeiling;
  /** Optional caller-supplied tags propagated into the provenance record. */
  tags?: Record<string, string>;
  /** Soft hint to the provider — max tokens / temperature. */
  maxTokens?: number;
  temperature?: number;
}

/** The provider response. */
export interface LlmStructuredResponse<T> {
  /** Parsed, schema-validated output. */
  output: T;
  /** Provenance record — the caller MUST persist this before using `output`. */
  provenance: LlmCallProvenance;
}

/** Provider-agnostic LLM interface. Implementations live below. */
export interface LlmProvider {
  /** Logical name — `"openai"`, `"anthropic"`, `"azure-openai"`, `"deterministic-mock"`. */
  readonly id: string;
  /** Model identifier — `"gpt-4o-mini"`, `"claude-3-5-sonnet"`, `"mock-1"`. */
  readonly model: string;

  complete<T>(
    prompt: string,
    schema: OutputSchema,
    parser: (raw: unknown) => T,
    callerSurface: string,
    options?: LlmCallOptions,
  ): Promise<LlmStructuredResponse<T>>;
}

/* ─────────────────────────────────────────────────────────────────────
 *  Deterministic mock provider
 * ───────────────────────────────────────────────────────────────────── */

/** Canned-output entry. */
export interface DeterministicEntry {
  /** Substring or exact-match key matched against the prompt. */
  match: string | RegExp;
  /** Output the parser will see. Must satisfy the supplied parser/schema. */
  response: unknown;
}

export interface DeterministicMockProviderOptions {
  /** Canned outputs in priority order — first match wins. */
  entries?: DeterministicEntry[];
  /** Optional default returned when nothing matches. */
  defaultResponse?: unknown;
  /** Per-call latency in ms — defaults to a deterministic 1ms. */
  latencyMs?: number;
  /** Optional clock override. */
  now?: () => Date;
}

/**
 * Map a finite set of known prompts to canned outputs. The default
 * provider for tests and the demo. Costs $0 per call; latency is fixed.
 */
export class DeterministicMockProvider implements LlmProvider {
  readonly id = "deterministic-mock";
  readonly model: string;
  private readonly entries: DeterministicEntry[];
  private readonly defaultResponse: unknown;
  private readonly latencyMs: number;
  private readonly now: () => Date;

  constructor(opts: DeterministicMockProviderOptions & { model?: string } = {}) {
    this.entries = opts.entries ?? [];
    this.defaultResponse = opts.defaultResponse;
    this.latencyMs = opts.latencyMs ?? 1;
    this.now = opts.now ?? (() => new Date());
    this.model = opts.model ?? "mock-1";
  }

  async complete<T>(
    prompt: string,
    _schema: OutputSchema,
    parser: (raw: unknown) => T,
    callerSurface: string,
    options: LlmCallOptions = {},
  ): Promise<LlmStructuredResponse<T>> {
    const start = this.now().getTime();
    const raw = this.lookup(prompt);
    let output: T;
    try {
      output = parser(raw);
    } catch (err) {
      throw new Error(
        `DeterministicMockProvider: canned response did not parse for caller "${callerSurface}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const end = start + this.latencyMs;
    const provenance = buildLlmCallProvenance({
      caller: callerSurface,
      provider: this.id,
      model: this.model,
      prompt,
      response: output,
      latencyMs: this.latencyMs,
      tokens: { input: estimateTokens(prompt), output: estimateTokens(JSON.stringify(output)), total: 0 },
      costUsd: 0,
      now: () => new Date(end),
      ...(options.tags ? { tags: options.tags } : {}),
    });
    if (provenance.tokens) {
      provenance.tokens.total =
        (provenance.tokens.input ?? 0) + (provenance.tokens.output ?? 0);
    }
    // Charge $0 against the cost ceiling for symmetry with real providers.
    options.costCeiling?.charge(0);
    return { output, provenance };
  }

  private lookup(prompt: string): unknown {
    for (const e of this.entries) {
      if (e.match instanceof RegExp) {
        if (e.match.test(prompt)) return e.response;
      } else if (prompt.includes(e.match)) {
        return e.response;
      }
    }
    if (this.defaultResponse !== undefined) return this.defaultResponse;
    throw new Error(
      `DeterministicMockProvider: no canned response matched prompt "${truncate(prompt)}"`,
    );
  }
}

function truncate(s: string): string {
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

function estimateTokens(s: string): number {
  // Crude token estimate so the mock looks like a real provider. ~4
  // chars per token on average for English.
  return Math.ceil(s.length / 4);
}

/* ─────────────────────────────────────────────────────────────────────
 *  Real-provider adapters (peer-optional, lazy-loaded)
 * ───────────────────────────────────────────────────────────────────── */

/** Configuration for OpenAiProvider. */
export interface OpenAiProviderConfig {
  apiKey: string;
  model: string;
  /** Override base URL — supports proxies and local LM Studio. */
  baseUrl?: string;
  /** Approximate $ per 1k input tokens (for cost estimation). */
  inputCostPer1k?: number;
  /** Approximate $ per 1k output tokens (for cost estimation). */
  outputCostPer1k?: number;
  /** Override clock. */
  now?: () => Date;
}

/** Configuration for AnthropicProvider. */
export interface AnthropicProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  now?: () => Date;
}

/** Configuration for AzureOpenAiProvider. */
export interface AzureOpenAiProviderConfig {
  apiKey: string;
  endpoint: string;
  deployment: string;
  apiVersion?: string;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  now?: () => Date;
}

/** Default cost-estimation table — current as of 2026-05. */
const DEFAULT_COSTS: Record<string, { input: number; output: number }> = {
  // OpenAI public list prices (per 1k tokens).
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  // Anthropic.
  "claude-3-5-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-5-haiku": { input: 0.0008, output: 0.004 },
};

function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  override?: { inputCostPer1k?: number; outputCostPer1k?: number },
): number {
  const t = DEFAULT_COSTS[model];
  const inputPer1k = override?.inputCostPer1k ?? t?.input ?? 0;
  const outputPer1k = override?.outputCostPer1k ?? t?.output ?? 0;
  return (inputTokens / 1000) * inputPer1k + (outputTokens / 1000) * outputPer1k;
}

/**
 * OpenAI provider. Uses the `openai` SDK lazily — install in the
 * consuming app if you intend to talk to a real OpenAI endpoint. Tests
 * use DeterministicMockProvider instead.
 */
export class OpenAiProvider implements LlmProvider {
  readonly id = "openai";
  readonly model: string;
  private readonly config: OpenAiProviderConfig;
  private clientPromise?: Promise<unknown>;

  constructor(config: OpenAiProviderConfig) {
    this.config = config;
    this.model = config.model;
  }

  async complete<T>(
    prompt: string,
    schema: OutputSchema,
    parser: (raw: unknown) => T,
    callerSurface: string,
    options: LlmCallOptions = {},
  ): Promise<LlmStructuredResponse<T>> {
    const client = await this.loadClient();
    const now = this.config.now ?? (() => new Date());
    const start = now().getTime();
    const result = await (client as {
      chat: {
        completions: {
          create: (req: unknown) => Promise<{
            choices: Array<{ message: { content: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          }>;
        };
      };
    }).chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_schema", json_schema: { name: schema.name, schema: schema.jsonSchema, strict: true } },
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    });
    const content = result.choices?.[0]?.message?.content ?? "";
    const raw = safeParseJson(content);
    const output = parser(raw);
    const latencyMs = Math.max(1, now().getTime() - start);
    const inputTokens = result.usage?.prompt_tokens ?? estimateTokens(prompt);
    const outputTokens = result.usage?.completion_tokens ?? estimateTokens(content);
    const costUsd = estimateCostUsd(this.model, inputTokens, outputTokens, this.config);
    options.costCeiling?.charge(costUsd);
    const provenance = buildLlmCallProvenance({
      caller: callerSurface,
      provider: this.id,
      model: this.model,
      prompt,
      response: output,
      latencyMs,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: result.usage?.total_tokens ?? inputTokens + outputTokens,
      },
      costUsd,
      now,
      ...(options.tags ? { tags: options.tags } : {}),
    });
    return { output, provenance };
  }

  private async loadClient(): Promise<unknown> {
    if (this.clientPromise) return this.clientPromise;
    this.clientPromise = (async () => {
      try {
        const mod = (await import("openai")) as {
          default?: new (opts: { apiKey: string; baseURL?: string }) => unknown;
          OpenAI?: new (opts: { apiKey: string; baseURL?: string }) => unknown;
        };
        const Ctor = mod.default ?? mod.OpenAI;
        if (!Ctor) {
          throw new Error('OpenAI SDK is loaded but has no default/OpenAI export');
        }
        const opts: { apiKey: string; baseURL?: string } = { apiKey: this.config.apiKey };
        if (this.config.baseUrl !== undefined) opts.baseURL = this.config.baseUrl;
        return new Ctor(opts);
      } catch (err) {
        throw new Error(
          `OpenAiProvider: the "openai" package is required. Install it in the consuming app: pnpm add openai. Underlying: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    })();
    return this.clientPromise;
  }
}

/**
 * Anthropic provider. Uses `@anthropic-ai/sdk` lazily.
 */
export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic";
  readonly model: string;
  private readonly config: AnthropicProviderConfig;
  private clientPromise?: Promise<unknown>;

  constructor(config: AnthropicProviderConfig) {
    this.config = config;
    this.model = config.model;
  }

  async complete<T>(
    prompt: string,
    schema: OutputSchema,
    parser: (raw: unknown) => T,
    callerSurface: string,
    options: LlmCallOptions = {},
  ): Promise<LlmStructuredResponse<T>> {
    const client = await this.loadClient();
    const now = this.config.now ?? (() => new Date());
    const start = now().getTime();
    const result = await (client as {
      messages: {
        create: (req: unknown) => Promise<{
          content: Array<{ type: string; text?: string; input?: unknown }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        }>;
      };
    }).messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 1024,
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: schema.name,
          description: schema.description,
          input_schema: schema.jsonSchema,
        },
      ],
      tool_choice: { type: "tool", name: schema.name },
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    });
    const toolBlock = result.content?.find((b) => b.type === "tool_use");
    const raw = toolBlock?.input ?? safeParseJson(toolBlock?.text ?? "");
    const output = parser(raw);
    const latencyMs = Math.max(1, now().getTime() - start);
    const inputTokens = result.usage?.input_tokens ?? estimateTokens(prompt);
    const outputTokens = result.usage?.output_tokens ?? estimateTokens(JSON.stringify(raw));
    const costUsd = estimateCostUsd(this.model, inputTokens, outputTokens, this.config);
    options.costCeiling?.charge(costUsd);
    const provenance = buildLlmCallProvenance({
      caller: callerSurface,
      provider: this.id,
      model: this.model,
      prompt,
      response: output,
      latencyMs,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
      costUsd,
      now,
      ...(options.tags ? { tags: options.tags } : {}),
    });
    return { output, provenance };
  }

  private async loadClient(): Promise<unknown> {
    if (this.clientPromise) return this.clientPromise;
    this.clientPromise = (async () => {
      try {
        const mod = (await import("@anthropic-ai/sdk")) as {
          default?: new (opts: { apiKey: string; baseURL?: string }) => unknown;
          Anthropic?: new (opts: { apiKey: string; baseURL?: string }) => unknown;
        };
        const Ctor = mod.default ?? mod.Anthropic;
        if (!Ctor) {
          throw new Error("@anthropic-ai/sdk has no default/Anthropic export");
        }
        const opts: { apiKey: string; baseURL?: string } = { apiKey: this.config.apiKey };
        if (this.config.baseUrl !== undefined) opts.baseURL = this.config.baseUrl;
        return new Ctor(opts);
      } catch (err) {
        throw new Error(
          `AnthropicProvider: the "@anthropic-ai/sdk" package is required. Install it in the consuming app: pnpm add @anthropic-ai/sdk. Underlying: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    })();
    return this.clientPromise;
  }
}

/**
 * Azure OpenAI provider. Uses `@azure/openai` lazily.
 */
export class AzureOpenAiProvider implements LlmProvider {
  readonly id = "azure-openai";
  readonly model: string;
  private readonly config: AzureOpenAiProviderConfig;
  private clientPromise?: Promise<unknown>;

  constructor(config: AzureOpenAiProviderConfig) {
    this.config = config;
    this.model = config.deployment;
  }

  async complete<T>(
    prompt: string,
    schema: OutputSchema,
    parser: (raw: unknown) => T,
    callerSurface: string,
    options: LlmCallOptions = {},
  ): Promise<LlmStructuredResponse<T>> {
    const client = await this.loadClient();
    const now = this.config.now ?? (() => new Date());
    const start = now().getTime();
    const result = await (client as {
      getChatCompletions: (
        deployment: string,
        messages: Array<{ role: string; content: string }>,
        opts: unknown,
      ) => Promise<{
        choices: Array<{ message?: { content?: string } }>;
        usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
      }>;
    }).getChatCompletions(
      this.config.deployment,
      [{ role: "user", content: prompt }],
      {
        responseFormat: {
          type: "json_schema",
          jsonSchema: { name: schema.name, schema: schema.jsonSchema, strict: true },
        },
        ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      },
    );
    const content = result.choices?.[0]?.message?.content ?? "";
    const raw = safeParseJson(content);
    const output = parser(raw);
    const latencyMs = Math.max(1, now().getTime() - start);
    const inputTokens = result.usage?.promptTokens ?? estimateTokens(prompt);
    const outputTokens = result.usage?.completionTokens ?? estimateTokens(content);
    const costUsd = estimateCostUsd(this.config.deployment, inputTokens, outputTokens, this.config);
    options.costCeiling?.charge(costUsd);
    const provenance = buildLlmCallProvenance({
      caller: callerSurface,
      provider: this.id,
      model: this.config.deployment,
      prompt,
      response: output,
      latencyMs,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: result.usage?.totalTokens ?? inputTokens + outputTokens,
      },
      costUsd,
      now,
      ...(options.tags ? { tags: options.tags } : {}),
    });
    return { output, provenance };
  }

  private async loadClient(): Promise<unknown> {
    if (this.clientPromise) return this.clientPromise;
    this.clientPromise = (async () => {
      try {
        const mod = (await import("@azure/openai")) as {
          OpenAIClient?: new (endpoint: string, credential: unknown, opts?: { apiVersion?: string }) => unknown;
          AzureKeyCredential?: new (key: string) => unknown;
        };
        if (!mod.OpenAIClient || !mod.AzureKeyCredential) {
          throw new Error("@azure/openai exports missing");
        }
        const credential = new mod.AzureKeyCredential(this.config.apiKey);
        const opts: { apiVersion?: string } = {};
        if (this.config.apiVersion !== undefined) opts.apiVersion = this.config.apiVersion;
        return new mod.OpenAIClient(this.config.endpoint, credential, opts);
      } catch (err) {
        throw new Error(
          `AzureOpenAiProvider: the "@azure/openai" package is required. Install it in the consuming app: pnpm add @azure/openai. Underlying: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    })();
    return this.clientPromise;
  }
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/* ─────────────────────────────────────────────────────────────────────
 *  Provider selection
 * ───────────────────────────────────────────────────────────────────── */

export interface ProviderSelectionEnv {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_ENDPOINT?: string;
  AZURE_OPENAI_DEPLOYMENT?: string;
  AZURE_OPENAI_API_VERSION?: string;
  /** If set to "1"/"true", force the deterministic mock even if real keys are present. */
  DATABRIDGE_LLM_FORCE_MOCK?: string;
}

/**
 * Select a provider based on environment variables. If no real provider
 * is configured, returns the deterministic mock — guaranteeing the demo
 * works without paid LLM access.
 */
export function selectProviderFromEnv(
  env: ProviderSelectionEnv = process.env as ProviderSelectionEnv,
  mockOptions: DeterministicMockProviderOptions = {},
): LlmProvider {
  if (env.DATABRIDGE_LLM_FORCE_MOCK === "1" || env.DATABRIDGE_LLM_FORCE_MOCK === "true") {
    return new DeterministicMockProvider(mockOptions);
  }
  if (env.OPENAI_API_KEY) {
    return new OpenAiProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL ?? "gpt-4o-mini",
    });
  }
  if (env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL ?? "claude-3-5-haiku",
    });
  }
  if (env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_DEPLOYMENT) {
    const cfg: AzureOpenAiProviderConfig = {
      apiKey: env.AZURE_OPENAI_API_KEY,
      endpoint: env.AZURE_OPENAI_ENDPOINT,
      deployment: env.AZURE_OPENAI_DEPLOYMENT,
    };
    if (env.AZURE_OPENAI_API_VERSION !== undefined) cfg.apiVersion = env.AZURE_OPENAI_API_VERSION;
    return new AzureOpenAiProvider(cfg);
  }
  return new DeterministicMockProvider(mockOptions);
}

export { CostCeiling, CostCeilingExceededError };
