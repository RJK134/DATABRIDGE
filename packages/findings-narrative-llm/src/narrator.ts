/**
 * narrate(findings, {provider}) — main entry.
 *
 * Builds a structured prompt summarising the findings pack, asks the
 * provider for slot-filled output, validates against NarrativeSlotsZ,
 * sanitises, renders to text + markdown.
 */
import type { AuditFinding, RuleSeverity } from "@databridge/rule-core";
import { type LlmProvider, type LlmCallOptions } from "@databridge/rule-compiler-llm";
import type { LlmCallProvenance } from "@databridge/provenance-core";
import {
  NARRATIVE_SCHEMA,
  NarrativeSlotsZ,
  sanitiseSlots,
  type NarrativeSlots,
} from "./template.js";
import { renderText, renderMarkdown } from "./render.js";

const CALLER = "findings-narrative-llm";

export interface NarrateOptions {
  provider: LlmProvider;
  llmOptions?: LlmCallOptions;
  /** Override prompt builder — tests inject one. */
  buildPrompt?: (findings: readonly AuditFinding[]) => string;
  /**
   * Override how empty-findings packs are handled. By default an empty
   * pack short-circuits and returns a canned "no findings" narrative
   * WITHOUT calling the provider — saves a paid call.
   */
  emptyNarrative?: NarrativeSlots;
}

export interface NarrateResult {
  slots: NarrativeSlots;
  text: string;
  markdown: string;
  /** Null when the empty-pack short-circuit was taken. */
  provenance: LlmCallProvenance | null;
}

const DEFAULT_EMPTY: NarrativeSlots = {
  headline_sentence: "No audit findings detected in this run.",
  severity_breakdown_bullets: ["0 CRITICAL, 0 ERROR, 0 WARN, 0 INFO findings."],
  top_cluster_root_cause: "No clusters present.",
  recommended_next_actions: [{ owner: "Registry", action: "Continue monitoring." }],
};

export async function narrate(
  findings: readonly AuditFinding[],
  opts: NarrateOptions
): Promise<NarrateResult> {
  if (findings.length === 0) {
    const empty = opts.emptyNarrative ?? DEFAULT_EMPTY;
    return {
      slots: empty,
      text: renderText(empty),
      markdown: renderMarkdown(empty),
      provenance: null,
    };
  }
  const prompt = (opts.buildPrompt ?? defaultBuildPrompt)(findings);
  const { output, provenance } = await opts.provider.complete<NarrativeSlots>(
    prompt,
    NARRATIVE_SCHEMA,
    (raw) => NarrativeSlotsZ.parse(raw),
    CALLER,
    opts.llmOptions
  );
  const slots = sanitiseSlots(output);
  return {
    slots,
    text: renderText(slots),
    markdown: renderMarkdown(slots),
    provenance,
  };
}

export function defaultBuildPrompt(findings: readonly AuditFinding[]): string {
  const total = findings.length;
  const bySeverity = countBy(findings, (f) => f.severity);
  const byRule = countBy(findings, (f) => f.ruleId);
  const byEntity = countBy(findings, (f) => f.entityType);
  const topRules = topN(byRule, 5);
  const topEntities = topN(byEntity, 3);

  return [
    "You are the DATABRIDGE findings narrator. Summarise the audit-findings",
    "pack below into the JSON shape (no markdown, no HTML, no SQL).",
    "",
    `Total findings: ${total}`,
    `By severity: ${formatCounts(bySeverity)}`,
    `Top rules: ${formatTop(topRules)}`,
    `Top entities: ${formatTop(topEntities)}`,
    "",
    "The headline_sentence must be ≤ 220 chars. severity_breakdown_bullets",
    "must have at least one bullet. recommended_next_actions must have at",
    "least one entry with an owner role (e.g. Registry, CRM admin) and an",
    "imperative verb-phrase. Use plain English only.",
  ].join("\n");
}

function countBy<K>(items: readonly AuditFinding[], key: (f: AuditFinding) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function topN<K>(m: Map<K, number>, n: number): Array<{ key: K; count: number }> {
  const out = [...m.entries()].map(([key, count]) => ({ key, count }));
  out.sort((a, b) => b.count - a.count);
  return out.slice(0, n);
}

function formatCounts(m: Map<RuleSeverity, number>): string {
  return ["CRITICAL", "ERROR", "WARN", "INFO"]
    .map((s) => `${s}=${m.get(s as RuleSeverity) ?? 0}`)
    .join(", ");
}

function formatTop<K>(items: Array<{ key: K; count: number }>): string {
  return items.map((i) => `${String(i.key)}:${i.count}`).join(", ") || "(none)";
}
