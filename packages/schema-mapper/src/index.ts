/**
 * @databridge/schema-mapper — Phase L1.
 *
 * Public surface:
 *   - {@link loadBundledCorpus} — load the structured §6–§11 corpus.
 *   - {@link SchemaSuggester} — deterministic suggester. Pluggable LLM
 *     backend in future without touching the public shape.
 *   - {@link suggestionsToMd} — pretty-print a batch of suggestions.
 */
export * from "./types.js";
export {
  loadBundledCorpus,
  buildFlatIndex,
  type FlatIndexEntry,
} from "./corpus-loader.js";
export { SchemaSuggester, tokens, jaccard } from "./suggester.js";
export {
  MemoryLearningStore,
  learnedConfidence,
  type LearningStore,
  type LearnedMapping,
  type RecordCorrectionInput,
} from "./learning.js";

import type { SuggestionResult } from "./types.js";
import { isFieldSuggestion } from "./types.js";

/** Render suggestions as a markdown table — useful for PR comments. */
export function suggestionsToMd(results: readonly SuggestionResult[]): string {
  const lines: string[] = [];
  lines.push("| source | suggested canonical | entity | score | rationale |");
  lines.push("| --- | --- | --- | ---: | --- |");
  for (const r of results) {
    if (isFieldSuggestion(r)) {
      lines.push(
        `| \`${r.sourceColumn}\` | \`${r.canonical}\` | ${r.entity} | ${r.score.toFixed(2)} | ${r.rationale} |`,
      );
    } else {
      lines.push(`| \`${r.sourceColumn}\` | _(none)_ | — | — | ${r.reason} |`);
    }
  }
  return lines.join("\n");
}
