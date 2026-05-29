/**
 * Narrative-report template grammar.
 *
 * The LLM only fills slots. Every slot has a hard character limit and a
 * regex of allowed characters — no markdown, no HTML, no SQL. The
 * deterministic renderer composes the final text. This means a hostile
 * or hallucinating model cannot inject arbitrary content into the
 * executive summary.
 */
import { z } from "zod";

/**
 * Characters permitted in narrative slot strings. ASCII letters / digits,
 * common punctuation, em/en-dashes, smart quotes, currency symbols, and
 * newlines. Deliberately excludes `<`, `>`, backticks, asterisks, square /
 * curly brackets, and pipe — all common markdown / HTML / SQL surfaces.
 */
const NARRATIVE_RE = /^[A-Za-z0-9 .,;:!?'"()/\-_+@%£$€¥&—–‘’“”\n]*$/;

/** Single bullet — short, plain text only. */
const BulletZ = z.string().min(1).max(180).regex(NARRATIVE_RE);

/** Recommended-next-action item. Each carries an owner role + verb-phrase. */
export const RecommendedActionZ = z.object({
  /** Short owner role (e.g. "Registry", "CRM admin"). */
  owner: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9 .,'\-_/]*$/),
  /** Action description — imperative sentence. */
  action: z.string().min(3).max(180).regex(NARRATIVE_RE),
  /** Optional priority (1 = highest). */
  priority: z.number().int().min(1).max(5).optional(),
});
export type RecommendedAction = z.infer<typeof RecommendedActionZ>;

/** Narrative slots returned by the LLM. */
export const NarrativeSlotsZ = z.object({
  /** One-sentence headline summarising the run. Hard cap 220 chars. */
  headline_sentence: z.string().min(1).max(220).regex(NARRATIVE_RE),
  /** 3–6 short bullets summarising severity breakdown. */
  severity_breakdown_bullets: z.array(BulletZ).min(1).max(6),
  /** 1–3 sentences identifying the top cluster's likely root cause. */
  top_cluster_root_cause: z.string().min(1).max(420).regex(NARRATIVE_RE),
  /** 2–6 recommended next-action items. */
  recommended_next_actions: z.array(RecommendedActionZ).min(1).max(6),
});
export type NarrativeSlots = z.infer<typeof NarrativeSlotsZ>;

/** JSON Schema sent verbatim to real providers. */
export const NARRATIVE_SCHEMA = {
  name: "DatabridgeFindingsNarrative",
  description:
    "An executive-summary narrative for a DATABRIDGE audit-findings pack. The LLM fills only the four slots listed; the deterministic renderer composes the final text. No SQL, no markdown, no HTML.",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    required: [
      "headline_sentence",
      "severity_breakdown_bullets",
      "top_cluster_root_cause",
      "recommended_next_actions",
    ],
    properties: {
      headline_sentence: { type: "string", maxLength: 220 },
      severity_breakdown_bullets: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: { type: "string", maxLength: 180 },
      },
      top_cluster_root_cause: { type: "string", maxLength: 420 },
      recommended_next_actions: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: {
          type: "object",
          required: ["owner", "action"],
          properties: {
            owner: { type: "string", maxLength: 40 },
            action: { type: "string", maxLength: 180 },
            priority: { type: "integer", minimum: 1, maximum: 5 },
          },
        },
      },
    },
  },
} as const;

/**
 * Truncate a string to a max length without breaking words. Used as a
 * defensive net after parsing — if the LLM somehow returns a string of
 * exactly the maximum length we still smooth it.
 */
export function safeTruncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const trimmed = s.slice(0, max).replace(/\s+\S*$/, "");
  return trimmed.length > 0 ? trimmed : s.slice(0, max);
}

/**
 * Sanitise a parsed NarrativeSlots — guarantees idempotent regex
 * checks and trims trailing whitespace.
 */
export function sanitiseSlots(s: NarrativeSlots): NarrativeSlots {
  return {
    headline_sentence: s.headline_sentence.trim(),
    severity_breakdown_bullets: s.severity_breakdown_bullets.map((b) => b.trim()),
    top_cluster_root_cause: s.top_cluster_root_cause.trim(),
    recommended_next_actions: s.recommended_next_actions.map((a) => {
      const out: RecommendedAction = {
        owner: a.owner.trim(),
        action: a.action.trim(),
      };
      if (a.priority !== undefined) out.priority = a.priority;
      return out;
    }),
  };
}
