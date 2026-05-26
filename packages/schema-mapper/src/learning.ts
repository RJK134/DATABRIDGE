/**
 * Schema-mapper learning loop.
 *
 * The Phase L1 suggester is deterministic — Jaccard token similarity over
 * the bundled SITS/Banner crosswalk corpus. That gets us ~80% of the way
 * but doesn't adapt to site-specific conventions (e.g. one institution
 * names its canonical wrapper column `stu_dob_iso` while another uses
 * `student_date_of_birth`).
 *
 * The learning loop records the engineer's accepted/corrected mappings
 * and feeds them back as a prior signal on the next round of suggestions:
 *
 *   - `recordCorrection({ system, sourceColumn, canonical, entity })`
 *     captures one accept/edit decision.
 *   - On next `suggest()`, if the same `(system, sourceColumn)` is asked
 *     again, the learned `canonical` is surfaced as the top candidate at
 *     a high confidence (capped at 0.98), with all deterministic
 *     candidates degraded to alternatives.
 *
 * The store is pluggable — the in-memory `MemoryLearningStore` ships by
 * default; persistence (Postgres, filesystem JSON, Redis) plugs in
 * through the {@link LearningStore} interface and is left to the host
 * application.
 *
 * Determinism guarantee: given the same store contents the suggester is
 * deterministic. The store is the only mutable state.
 */
import type { CrosswalkSystem } from "./types.js";

/** A single observed correction. */
export interface LearnedMapping {
  system: CrosswalkSystem;
  sourceColumn: string;
  canonical: string;
  entity: string;
  /** How many times we've seen this (sourceColumn → canonical) decision. */
  acceptCount: number;
  /** ISO timestamp of the most recent acceptance. */
  lastAcceptedAt: string;
}

export interface RecordCorrectionInput {
  system: CrosswalkSystem;
  sourceColumn: string;
  canonical: string;
  entity: string;
  /** Optional override for the timestamp (used by tests for determinism). */
  at?: Date;
}

export interface LearningStore {
  /** Look up the best learned mapping for a `(system, column)` pair. */
  lookup(system: CrosswalkSystem, sourceColumn: string): LearnedMapping | undefined;
  /** Record one accepted/corrected mapping. */
  record(input: RecordCorrectionInput): LearnedMapping;
  /** Dump everything in the store — useful for persistence and tests. */
  dumpAll(): readonly LearnedMapping[];
  /** Bulk-load (e.g. when restoring from persisted JSON). */
  loadAll(entries: readonly LearnedMapping[]): void;
  /** Number of distinct (system, sourceColumn) entries. */
  size(): number;
  /** Empty the store. */
  clear(): void;
}

/**
 * In-memory implementation. Keyed by `${system}::${columnNormalised}` so
 * that case / whitespace differences don't fragment the same logical
 * column.
 */
export class MemoryLearningStore implements LearningStore {
  // Map<key, Map<canonical, LearnedMapping>>
  // We keep all observed canonicals per column rather than only the most
  // recent — this lets us surface "the engineer has accepted this mapping
  // 8 times vs that alternative 2 times" semantics if a richer UI lands.
  private readonly entries = new Map<string, Map<string, LearnedMapping>>();

  static keyFor(system: CrosswalkSystem, sourceColumn: string): string {
    return `${system}::${sourceColumn.trim().toLowerCase()}`;
  }

  lookup(system: CrosswalkSystem, sourceColumn: string): LearnedMapping | undefined {
    const key = MemoryLearningStore.keyFor(system, sourceColumn);
    const bucket = this.entries.get(key);
    if (!bucket || bucket.size === 0) return undefined;
    // Best = max acceptCount, ties broken by most recent
    let best: LearnedMapping | undefined;
    for (const entry of bucket.values()) {
      if (!best) {
        best = entry;
        continue;
      }
      if (entry.acceptCount > best.acceptCount) {
        best = entry;
      } else if (
        entry.acceptCount === best.acceptCount &&
        entry.lastAcceptedAt > best.lastAcceptedAt
      ) {
        best = entry;
      }
    }
    return best;
  }

  record(input: RecordCorrectionInput): LearnedMapping {
    const key = MemoryLearningStore.keyFor(input.system, input.sourceColumn);
    let bucket = this.entries.get(key);
    if (!bucket) {
      bucket = new Map<string, LearnedMapping>();
      this.entries.set(key, bucket);
    }
    const at = (input.at ?? new Date()).toISOString();
    const existing = bucket.get(input.canonical);
    const next: LearnedMapping = existing
      ? {
          ...existing,
          acceptCount: existing.acceptCount + 1,
          lastAcceptedAt: at,
        }
      : {
          system: input.system,
          sourceColumn: input.sourceColumn,
          canonical: input.canonical,
          entity: input.entity,
          acceptCount: 1,
          lastAcceptedAt: at,
        };
    bucket.set(input.canonical, next);
    return next;
  }

  dumpAll(): readonly LearnedMapping[] {
    const out: LearnedMapping[] = [];
    for (const bucket of this.entries.values()) {
      for (const m of bucket.values()) out.push(m);
    }
    return out;
  }

  loadAll(entries: readonly LearnedMapping[]): void {
    for (const e of entries) {
      const key = MemoryLearningStore.keyFor(e.system, e.sourceColumn);
      let bucket = this.entries.get(key);
      if (!bucket) {
        bucket = new Map<string, LearnedMapping>();
        this.entries.set(key, bucket);
      }
      bucket.set(e.canonical, { ...e });
    }
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Confidence boost applied to a learned mapping. Capped at 0.98 — we
 * never claim absolute certainty, the engineer still ratifies. Each
 * additional acceptance bumps confidence but with diminishing returns.
 */
export function learnedConfidence(acceptCount: number): number {
  if (acceptCount <= 0) return 0;
  // 1: 0.85, 2: 0.92, 3: 0.95, 4+: asymptote at 0.98.
  const c = 0.85 + (1 - Math.exp(-0.4 * acceptCount)) * 0.13;
  return Math.min(0.98, Math.round(c * 100) / 100);
}
