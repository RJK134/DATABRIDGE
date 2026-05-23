/**
 * TelemetryAdapter — pluggable observability
 * Default: OpenTelemetry (OTLP exporter)
 * Fallback: console (development)
 */
export interface TelemetryAdapter {
  /** Start a span. Returns a handle to end it. */
  startSpan(name: string, attributes?: SpanAttributes): SpanHandle;

  /** Record a metric counter increment. */
  counter(name: string, value?: number, attributes?: SpanAttributes): void;

  /** Record a histogram observation. */
  histogram(name: string, value: number, attributes?: SpanAttributes): void;

  /** Record a gauge value. */
  gauge(name: string, value: number, attributes?: SpanAttributes): void;
}

export type SpanAttributes = Record<string, string | number | boolean>;

export interface SpanHandle {
  setAttributes(attributes: SpanAttributes): void;
  setStatus(status: "ok" | "error", message?: string): void;
  end(): void;
}
