/**
 * @databridge/findings-narrative-llm
 *
 * Generate a strict-templated executive summary for an audit-findings
 * pack. The LLM only fills four slots — headline sentence, severity
 * breakdown bullets, top-cluster root cause, recommended next actions —
 * each with hard length + regex limits. A deterministic renderer
 * composes the final plain-text and markdown forms. Every LLM call
 * emits an LlmCallProvenance record.
 */
export * from "./template.js";
export * from "./render.js";
export * from "./narrator.js";
