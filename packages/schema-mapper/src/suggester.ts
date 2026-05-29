/**
 * Phase L1 — deterministic schema-mapping suggester.
 *
 * Heuristics, in order:
 *   1. Exact column-token match against the corpus (`SPRIDEN_LAST_NAME`
 *      → seen in §6 row for `surname`).
 *   2. Substring containment — column appears inside the corpus source
 *      expression, or vice versa.
 *   3. Token-set similarity — Jaccard over normalised tokens.
 *   4. Canonical-name similarity — Jaccard over the canonical field
 *      name tokens (catches engineers naming their adapter column the
 *      same as the canonical field).
 *
 * The suggester surfaces the top candidate plus up to 3 alternatives
 * and a one-line rationale per match, so engineers can audit at a
 * glance. Confidence is computed from the maximum signal strength
 * across the heuristics — explicitly capped at 0.95 because *no*
 * deterministic match is ever "certain"; the engineer ratifies.
 *
 * The interface is designed so a future implementation can swap to a
 * live LLM call by replacing `suggestForColumn` while preserving the
 * `SuggestionResult` shape.
 */
import { buildFlatIndex, loadBundledCorpus } from "./corpus-loader.js";
import type {
  CorpusBundle,
  CrosswalkSystem,
  FieldSuggestion,
  NoSuggestion,
  SuggestionResult,
  SuggestRequest,
} from "./types.js";
import {
  MemoryLearningStore,
  learnedConfidence,
  type LearningStore,
  type RecordCorrectionInput,
} from "./learning.js";

interface CandidateScore {
  canonical: string;
  entity: string;
  score: number;
  rationale: string;
}

export interface SchemaSuggesterOptions {
  corpus?: CorpusBundle;
  /**
   * Optional learning store. When provided, accepted corrections
   * override deterministic heuristics for the same `(system, column)`
   * pair. When omitted, an internal MemoryLearningStore is created so
   * `recordCorrection()` still works (but state is lost on process exit).
   */
  learningStore?: LearningStore;
}

export class SchemaSuggester {
  private readonly corpus: CorpusBundle;
  private readonly index: ReturnType<typeof buildFlatIndex>;
  private readonly learningStore: LearningStore;

  constructor(options: SchemaSuggesterOptions = {}) {
    this.corpus = options.corpus ?? loadBundledCorpus();
    this.index = buildFlatIndex(this.corpus);
    this.learningStore = options.learningStore ?? new MemoryLearningStore();
  }

  /** Access the underlying learning store (read-only inspection or persistence). */
  getLearningStore(): LearningStore {
    return this.learningStore;
  }

  /**
   * Record a corrected/accepted mapping. The suggester will surface
   * this as the top candidate next time the same `(system, column)`
   * appears.
   */
  recordCorrection(input: RecordCorrectionInput): void {
    this.learningStore.record(input);
  }

  /** The currently loaded corpus version. */
  version(): string {
    return this.corpus.version;
  }

  /** All canonical entities the suggester knows about. */
  entities(): readonly string[] {
    return this.corpus.sections.map((s) => s.entity);
  }

  suggest(req: SuggestRequest): readonly SuggestionResult[] {
    const minScore = req.minScore ?? 0.35;
    const scope = new Set(req.entityScope ?? this.entities());
    return req.columns.map((col) => this.suggestForColumn(col, req.system, scope, minScore));
  }

  private suggestForColumn(
    column: string,
    system: CrosswalkSystem,
    scope: Set<string>,
    minScore: number
  ): SuggestionResult {
    const normCol = normaliseToken(column);
    const colTokens = tokens(column);
    const candidates: CandidateScore[] = [];

    // 0. Learned-prior lookup — if the engineer has previously accepted
    //    a mapping for this exact (system, column), surface it with the
    //    learned-confidence score so it overrides any deterministic
    //    heuristic. Deterministic candidates still flow through as
    //    alternatives for context.
    const learned = this.learningStore.lookup(system, column);
    if (learned && scope.has(learned.entity)) {
      candidates.push({
        canonical: learned.canonical,
        entity: learned.entity,
        score: learnedConfidence(learned.acceptCount),
        rationale: `learned from ${learned.acceptCount} prior acceptance${learned.acceptCount === 1 ? "" : "s"} (most recent ${learned.lastAcceptedAt.slice(0, 10)})`,
      });
    }

    for (const entry of this.index) {
      if (entry.system !== system) continue;
      if (!scope.has(entry.entity)) continue;

      const sourceNorm = normaliseToken(entry.source);
      const sourceTokens = tokens(entry.source);
      const canonicalTokens = tokens(entry.canonical);

      // 1. Exact-ish match: normalised column appears inside the source
      //    expression token-by-token.
      let score = 0;
      let rationale = "";

      if (sourceTokens.has(normCol)) {
        score = 0.95;
        rationale = `exact token match in §${section(this.corpus, entry.entity)} (\`${entry.source}\`)`;
      } else if (sourceNorm.includes(normCol) || normCol.includes(sourceNorm)) {
        score = 0.8;
        rationale = `substring containment vs \`${entry.source}\``;
      } else {
        // 3. Token-set similarity vs source tokens.
        const sourceJaccard = jaccard(colTokens, sourceTokens);
        // 4. Canonical name similarity.
        const canonicalJaccard = jaccard(colTokens, canonicalTokens);
        const best = Math.max(sourceJaccard, canonicalJaccard);
        if (best >= 0.25) {
          score = best;
          rationale =
            sourceJaccard >= canonicalJaccard
              ? `${(sourceJaccard * 100).toFixed(0)}% token overlap with \`${entry.source}\``
              : `${(canonicalJaccard * 100).toFixed(0)}% overlap with canonical \`${entry.canonical}\``;
        }
      }
      if (score > 0) {
        candidates.push({
          canonical: entry.canonical,
          entity: entry.entity,
          score,
          rationale,
        });
      }
    }

    if (candidates.length === 0) {
      return {
        sourceColumn: column,
        system,
        reason: "no corpus match",
      } satisfies NoSuggestion;
    }

    // Sort by score desc, dedupe by canonical (keep best per canonical)
    candidates.sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const deduped: CandidateScore[] = [];
    for (const c of candidates) {
      const key = `${c.entity}::${c.canonical}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(c);
    }
    const top = deduped[0]!;
    if (top.score < minScore) {
      return {
        sourceColumn: column,
        system,
        reason: `top score ${top.score.toFixed(2)} below threshold ${minScore}`,
      } satisfies NoSuggestion;
    }
    return {
      sourceColumn: column,
      system,
      canonical: top.canonical,
      entity: top.entity,
      score: top.score,
      rationale: top.rationale,
      alternatives: deduped.slice(1, 4).map((c) => ({
        canonical: c.canonical,
        entity: c.entity,
        score: c.score,
        rationale: c.rationale,
      })),
    } satisfies FieldSuggestion;
  }
}

// ---------------------------------------------------------------------------
// Tokenisation helpers
// ---------------------------------------------------------------------------

function normaliseToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Token splitter that handles SQL-ish identifiers: splits on
 * non-alphanumeric, then further splits camelCase / snake_case /
 * UPPER_CASE. Returns lower-cased tokens with very short tokens
 * (length < 2) dropped because they create noise (e.g. "id", "no").
 */
export function tokens(s: string): Set<string> {
  const raw = s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((t) => t.length > 0);
  const out = new Set<string>();
  for (const t of raw) {
    const lower = t.toLowerCase();
    if (lower.length >= 2) out.add(lower);
    // For long compound tokens like "SPRIDEN", also emit the bare token
    // so prefixed columns match short canonicals.
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function section(corpus: CorpusBundle, entity: string): string {
  const s = corpus.sections.find((x) => x.entity === entity);
  return s ? s.section.replace(/^§/, "") : "?";
}
