import { redactPii } from "../pii/redact.js";

/**
 * LlmAdapter — pluggable LLM provider
 * Implementations: Anthropic Claude (primary), OpenAI GPT (fallback),
 * Azure OpenAI, AWS Bedrock, OCI Generative AI
 */
export interface LlmAdapter {
  readonly provider: string;
  readonly model: string;

  chat(
    messages: LlmMessage[],
    opts?: LlmCallOptions
  ): Promise<LlmResponse>;

  /** Structured JSON output — validates response against provided schema name. */
  chatStructured<T>(
    messages: LlmMessage[],
    schema: LlmOutputSchema<T>,
    opts?: LlmCallOptions
  ): Promise<T>;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCallOptions {
  maxTokens?: number;
  temperature?: number;
  /** If true, PII redaction is applied to all message content before sending */
  redactPii?: boolean;
}

export interface LlmResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  stopReason: string;
}

export interface LlmOutputSchema<T> {
  name: string;
  description: string;
  parse(raw: unknown): T;
}

/**
 * PII-redacting LlmAdapter decorator.
 * Wraps any LlmAdapter and redacts PII from messages before forwarding.
 * This is the only adapter variant that should be used in production.
 */
export class PiiRedactingLlmAdapter implements LlmAdapter {
  constructor(private readonly inner: LlmAdapter) {}

  get provider() { return this.inner.provider; }
  get model() { return this.inner.model; }

  async chat(messages: LlmMessage[], opts?: LlmCallOptions): Promise<LlmResponse> {
    const safe = messages.map((m) => ({ ...m, content: redactPii(m.content) }));
    return this.inner.chat(safe, { ...opts, redactPii: false });
  }

  async chatStructured<T>(
    messages: LlmMessage[],
    schema: LlmOutputSchema<T>,
    opts?: LlmCallOptions
  ): Promise<T> {
    const safe = messages.map((m) => ({ ...m, content: redactPii(m.content) }));
    return this.inner.chatStructured(safe, schema, { ...opts, redactPii: false });
  }
}
