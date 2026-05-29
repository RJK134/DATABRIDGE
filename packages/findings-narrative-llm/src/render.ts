/**
 * Render narrative slots into plain text and deterministic markdown.
 *
 * The renderer is pure: same slots → same output. No prompt injection
 * surface (the LLM-supplied strings are constrained to the
 * NARRATIVE_RE character set).
 */
import type { NarrativeSlots } from "./template.js";

export function renderText(slots: NarrativeSlots): string {
  const lines: string[] = [];
  lines.push(slots.headline_sentence);
  lines.push("");
  lines.push("Severity breakdown");
  for (const b of slots.severity_breakdown_bullets) {
    lines.push(`  - ${b}`);
  }
  lines.push("");
  lines.push("Top cluster — likely root cause");
  lines.push(`  ${slots.top_cluster_root_cause}`);
  lines.push("");
  lines.push("Recommended next actions");
  for (const a of sortActions(slots.recommended_next_actions)) {
    const prio = a.priority !== undefined ? ` (P${a.priority})` : "";
    lines.push(`  - [${a.owner}]${prio} ${a.action}`);
  }
  return lines.join("\n");
}

export function renderMarkdown(slots: NarrativeSlots): string {
  const lines: string[] = [];
  lines.push(`# Findings narrative`);
  lines.push("");
  lines.push(slots.headline_sentence);
  lines.push("");
  lines.push("## Severity breakdown");
  for (const b of slots.severity_breakdown_bullets) {
    lines.push(`- ${b}`);
  }
  lines.push("");
  lines.push("## Top cluster — likely root cause");
  lines.push("");
  lines.push(slots.top_cluster_root_cause);
  lines.push("");
  lines.push("## Recommended next actions");
  lines.push("");
  for (const a of sortActions(slots.recommended_next_actions)) {
    const prio = a.priority !== undefined ? ` (P${a.priority})` : "";
    lines.push(`- **${a.owner}**${prio}: ${a.action}`);
  }
  return lines.join("\n");
}

function sortActions(
  actions: NarrativeSlots["recommended_next_actions"]
): NarrativeSlots["recommended_next_actions"] {
  // Sort by priority ascending; unprioritised items go last.
  return [...actions].sort((a, b) => {
    const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
    const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });
}
