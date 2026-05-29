/**
 * LlmAssistedSuggester — wraps the deterministic SchemaSuggester.
 *
 * Flow per source column:
 *   1. Ask the deterministic suggester.
 *   2. If it returns a FieldSuggestion with score >= threshold, return
 *      it unchanged. The LLM is NEVER called in this branch (the demo
 *      validates this with a dedicated test).
 *   3. Otherwise, build a candidate set from the deterministic
 *      result + nearest-neighbour embedding hits and ask the LLM to
 *      tie-break + explain. Replace the rationale with the LLM's
 *      explanation and attach the provenance record.
 *   4. The deterministic suggester's NoSuggestion is preserved when
 *      neither it nor the embedding index produces any candidate.
 */
import type { SchemaSuggester } from "@databridge/schema-mapper";
import {
  type FieldSuggestion,
  type NoSuggestion,
  type SuggestionResult,
  type SuggestRequest,
  isFieldSuggestion,
} from "@databridge/schema-mapper";
import { EmbeddingIndex, DeterministicHashEmbedding, type EmbeddingBackend } from "./embedding.js";
import { explainSuggestion } from "./explainer.js";
import { type LlmProvider, type LlmCallOptions } from "@databridge/rule-compiler-llm";
import type { LlmCallProvenance } from "@databridge/provenance-core";

export interface LlmAssistedSuggesterOptions {
  /** Underlying deterministic suggester (the source of truth). */
  deterministic: SchemaSuggester;
  /** LLM provider used for tie-breaking. */
  provider: LlmProvider;
  /**
   * Confidence floor — when the deterministic result is ≥ this we skip
   * the LLM entirely. Defaults to 0.6 (the deterministic suggester caps
   * its scores at 0.95).
   */
  threshold?: number;
  /** Embedding backend — defaults to the deterministic hash variant. */
  embedding?: EmbeddingBackend;
  /** Optional supplemental dictionary entries to seed the embedding index. */
  dictionaryEntries?: ReadonlyArray<{ canonical: string; entity: string; description?: string }>;
  /** Optional per-LLM-call options (cost ceiling, tags, …). */
  llmOptions?: LlmCallOptions;
}

export interface LlmAssistedFieldSuggestion extends FieldSuggestion {
  /** True when the LLM was invoked for this column. */
  llmConsulted: boolean;
  /** Provenance record — present iff llmConsulted=true. */
  provenance?: LlmCallProvenance;
  /** LLM-supplied rationale sentences — present iff llmConsulted=true. */
  llmRationale?: readonly string[];
}

export type LlmAssistedSuggestionResult = LlmAssistedFieldSuggestion | NoSuggestion;

export class LlmAssistedSuggester {
  private readonly deterministic: SchemaSuggester;
  private readonly provider: LlmProvider;
  private readonly threshold: number;
  private readonly embedding: EmbeddingBackend;
  private readonly index: EmbeddingIndex;
  private indexReady?: Promise<void>;
  private readonly seedEntries: ReadonlyArray<{
    canonical: string;
    entity: string;
    description?: string;
  }>;
  private readonly llmOptions?: LlmCallOptions;

  /** Counter used by tests to assert the LLM was (or wasn't) consulted. */
  private llmCallCount = 0;

  constructor(opts: LlmAssistedSuggesterOptions) {
    this.deterministic = opts.deterministic;
    this.provider = opts.provider;
    this.threshold = opts.threshold ?? 0.6;
    this.embedding = opts.embedding ?? new DeterministicHashEmbedding();
    this.index = new EmbeddingIndex(this.embedding);
    this.seedEntries = opts.dictionaryEntries ?? [];
    if (opts.llmOptions !== undefined) this.llmOptions = opts.llmOptions;
  }

  /** Number of times the LLM was consulted across the lifetime of this instance. */
  getLlmCallCount(): number {
    return this.llmCallCount;
  }

  async suggest(req: SuggestRequest): Promise<readonly LlmAssistedSuggestionResult[]> {
    const deterministicResults = this.deterministic.suggest(req);
    const out: LlmAssistedSuggestionResult[] = [];
    for (let i = 0; i < deterministicResults.length; i += 1) {
      const d = deterministicResults[i]!;
      const column = req.columns[i] ?? "";
      out.push(await this.handleOne(d, column));
    }
    return out;
  }

  private async handleOne(
    d: SuggestionResult,
    column: string
  ): Promise<LlmAssistedSuggestionResult> {
    if (!isFieldSuggestion(d)) {
      return d;
    }
    if (d.score >= this.threshold) {
      // High-confidence deterministic path — LLM NEVER called.
      return { ...d, llmConsulted: false };
    }
    // Tie-breaker path.
    await this.ensureIndex();
    const nearest = await this.index.nearest(column, 5);
    const candidates = mergeCandidates(d, nearest);
    this.llmCallCount += 1;
    const { explanation, provenance } = await explainSuggestion(
      { sourceColumn: column, candidates },
      this.provider,
      this.llmOptions
    );
    const chosen = explanation.chosen;
    // The LLM may pick a candidate from the merged set OR re-affirm the
    // deterministic top hit. Look up the entity for the chosen canonical.
    const chosenEntry = candidates.find((c) => c.canonical === chosen) ?? candidates[0]!;
    const result: LlmAssistedFieldSuggestion = {
      sourceColumn: d.sourceColumn,
      system: d.system,
      canonical: chosen,
      entity: chosenEntry.entity,
      score: clip(Math.max(d.score, explanation.confidence)),
      rationale: explanation.rationale.join(" "),
      alternatives: candidates
        .filter((c) => c.canonical !== chosen)
        .slice(0, 3)
        .map((c) => ({
          canonical: c.canonical,
          entity: c.entity,
          score: c.score,
          rationale: c.rationale,
        })),
      llmConsulted: true,
      provenance,
      llmRationale: explanation.rationale,
    };
    return result;
  }

  private async ensureIndex(): Promise<void> {
    if (this.indexReady !== undefined) return this.indexReady;
    this.indexReady = (async () => {
      // Build the embedding index lazily from the seed entries supplied
      // at construction time. Phase B keeps the index in memory; Phase
      // D wires a vector DB.
      const items = this.seedEntries.map((s) => ({
        id: `${s.entity}.${s.canonical}`,
        text: `${s.entity}.${s.canonical} ${s.description ?? s.canonical}`,
      }));
      // Fold in every canonical entity the deterministic suggester
      // knows about so the index is non-empty even without explicit seeds.
      for (const entity of this.deterministic.entities()) {
        items.push({ id: entity, text: entity });
      }
      await this.index.addAll(items);
    })();
    return this.indexReady;
  }
}

interface MergedCandidate {
  canonical: string;
  entity: string;
  score: number;
  rationale: string;
}

function mergeCandidates(
  d: FieldSuggestion,
  nearest: ReadonlyArray<{ id: string; score: number }>
): MergedCandidate[] {
  const seen = new Set<string>();
  const out: MergedCandidate[] = [];
  // Deterministic top + its alternatives go in first — they carry the
  // highest signal.
  push({ canonical: d.canonical, entity: d.entity, score: d.score, rationale: d.rationale });
  for (const a of d.alternatives) {
    push({ canonical: a.canonical, entity: a.entity, score: a.score, rationale: a.rationale });
  }
  for (const n of nearest) {
    const [entity, ...rest] = n.id.split(".");
    if (!entity) continue;
    const canonical = rest.length > 0 ? rest.join(".") : entity;
    push({
      canonical,
      entity,
      score: n.score,
      rationale: `embedding nearest-neighbour (cosine ${n.score.toFixed(2)})`,
    });
  }
  return out;

  function push(c: MergedCandidate): void {
    const key = `${c.entity}.${c.canonical}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  }
}

function clip(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
