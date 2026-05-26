/**
 * Write-through Postgres-backed {@link LearningStore}.
 *
 * The {@link PostgresLearningStore} is an async store — it cannot be
 * dropped into {@link SchemaSuggester} directly because the suggester's
 * `lookup()` is synchronous and called inside the per-column ranking.
 *
 * `CachedPostgresLearningStore` solves this with a write-through cache:
 *
 *   - Reads are served from an in-memory {@link MemoryLearningStore}
 *     hydrated at boot via {@link AsyncLearningStore.dumpAll}.
 *   - Writes update the cache synchronously AND fire-and-forget a
 *     persist call to Postgres. A `flush()` method awaits all pending
 *     persists for callers who need durability before returning (tests,
 *     checkpoints, graceful shutdown).
 *   - Periodic `refresh()` re-pulls from Postgres so multi-pod
 *     deployments converge without explicit cache invalidation.
 *
 * The corrections corpus is small (engineer-driven, hundreds of entries
 * in a typical institution) so an in-memory mirror is realistic. If
 * that ever changes, the suggester contract should be widened to async
 * and this class becomes redundant — for v1.2 the cache is the right
 * tradeoff.
 */
import { MemoryLearningStore } from "./learning.js";
import type { LearnedMapping, LearningStore, RecordCorrectionInput } from "./learning.js";
import {
  PostgresLearningStore,
  type AsyncLearningStore,
  type PostgresLearningStoreOptions,
} from "./learning-pg.js";
import type { CrosswalkSystem } from "./types.js";

export interface CachedPostgresLearningStoreOptions extends PostgresLearningStoreOptions {
  /**
   * If true, the cache is hydrated from Postgres on construction. Most
   * callers want this; tests sometimes opt out to control timing.
   * Default: true.
   */
  hydrateOnStart?: boolean;

  /**
   * Optional callback invoked when a background persist call fails.
   * Default: no-op (errors are silently swallowed). Production
   * deployments should wire this to their logger.
   */
  onPersistError?: (err: unknown, entry: RecordCorrectionInput) => void;
}

export class CachedPostgresLearningStore implements LearningStore {
  private readonly cache = new MemoryLearningStore();
  private readonly remote: AsyncLearningStore;
  private readonly onPersistError: (err: unknown, entry: RecordCorrectionInput) => void;
  private readonly pending = new Set<Promise<unknown>>();
  private hydrated = false;
  private readonly hydration: Promise<void>;

  constructor(opts: CachedPostgresLearningStoreOptions, remote?: AsyncLearningStore) {
    this.remote = remote ?? new PostgresLearningStore(opts);
    this.onPersistError = opts.onPersistError ?? (() => {});
    this.hydration =
      (opts.hydrateOnStart ?? true) ? this.hydrate() : Promise.resolve();
  }

  /**
   * Resolve when the initial hydration has completed (or immediately, if
   * `hydrateOnStart=false`). Useful in tests; production callers usually
   * don't need this since reads tolerate an empty cache during boot.
   */
  whenReady(): Promise<void> {
    return this.hydration;
  }

  /**
   * Re-pull the cache from Postgres. Multi-pod deployments should call
   * this on a timer (e.g. every 60s) so out-of-band corrections become
   * visible without a restart.
   */
  async refresh(): Promise<void> {
    const all = await this.remote.dumpAll();
    this.cache.clear();
    this.cache.loadAll(all);
    this.hydrated = true;
  }

  /** Wait for all in-flight persists to settle. */
  async flush(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }

  /* ---------------------- LearningStore (sync) ------------------------- */

  lookup(system: CrosswalkSystem, sourceColumn: string): LearnedMapping | undefined {
    return this.cache.lookup(system, sourceColumn);
  }

  record(input: RecordCorrectionInput): LearnedMapping {
    const out = this.cache.record(input);
    this.schedulePersist(input);
    return out;
  }

  dumpAll(): readonly LearnedMapping[] {
    return this.cache.dumpAll();
  }

  loadAll(entries: readonly LearnedMapping[]): void {
    this.cache.loadAll(entries);
    // Fire-and-forget remote upsert — caller can flush() if they need it.
    const p = this.remote
      .loadAll(entries)
      .catch((err) => this.onPersistError(err, syntheticBulkInput(entries.length)));
    this.track(p);
  }

  size(): number {
    return this.cache.size();
  }

  clear(): void {
    this.cache.clear();
    const p = this.remote.clear().catch((err) => this.onPersistError(err, syntheticBulkInput(0)));
    this.track(p);
  }

  /* --------------------------- internals ------------------------------- */

  private async hydrate(): Promise<void> {
    try {
      const entries = await this.remote.dumpAll();
      this.cache.loadAll(entries);
      this.hydrated = true;
    } catch (err) {
      // Reads degrade to an empty cache rather than crashing the suggester.
      // Caller's onPersistError will pick up the next failed write.
      this.onPersistError(err, syntheticBulkInput(0));
    }
  }

  /** Whether the cache has completed at least one hydration. */
  isHydrated(): boolean {
    return this.hydrated;
  }

  private schedulePersist(input: RecordCorrectionInput): void {
    const p = this.remote
      .record(input)
      .then(() => undefined)
      .catch((err) => this.onPersistError(err, input));
    this.track(p);
  }

  private track(p: Promise<unknown>): void {
    this.pending.add(p);
    p.finally(() => this.pending.delete(p));
  }
}

function syntheticBulkInput(n: number): RecordCorrectionInput {
  return {
    system: "sits" as CrosswalkSystem,
    sourceColumn: `<bulk:${n}>`,
    canonical: "<bulk>",
    entity: "<bulk>",
  };
}
