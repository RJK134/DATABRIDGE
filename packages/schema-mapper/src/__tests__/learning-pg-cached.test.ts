/**
 * CachedPostgresLearningStore tests — write-through cache backed by an
 * injected `AsyncLearningStore` fake. We assert the cache is hydrated at
 * boot, that writes hit both layers, that flush() awaits pending,
 * refresh() re-pulls, and onPersistError fires on rejection. We also
 * confirm SchemaSuggester can use the cache as a sync LearningStore.
 */
import { describe, it, expect, vi } from "vitest";
import {
  CachedPostgresLearningStore,
  SchemaSuggester,
  isFieldSuggestion,
  type AsyncLearningStore,
  type LearnedMapping,
  type RecordCorrectionInput,
} from "../index.js";
import type { CrosswalkSystem } from "../types.js";

class FakeAsyncStore implements AsyncLearningStore {
  public readonly entries = new Map<string, LearnedMapping>();
  public dumpAllCount = 0;
  public recordCount = 0;
  public failNextRecord = false;
  public failHydrate = false;

  static keyOf(system: CrosswalkSystem, sourceColumn: string, canonical: string) {
    return `${system}::${sourceColumn.trim().toLowerCase()}::${canonical}`;
  }

  async lookup(system: CrosswalkSystem, sourceColumn: string): Promise<LearnedMapping | undefined> {
    const norm = sourceColumn.trim().toLowerCase();
    let best: LearnedMapping | undefined;
    for (const m of this.entries.values()) {
      if (m.system !== system) continue;
      if (m.sourceColumn.trim().toLowerCase() !== norm) continue;
      if (!best || m.acceptCount > best.acceptCount) best = m;
    }
    return best;
  }

  async record(input: RecordCorrectionInput): Promise<LearnedMapping> {
    if (this.failNextRecord) {
      this.failNextRecord = false;
      throw new Error("simulated remote failure");
    }
    this.recordCount += 1;
    const key = FakeAsyncStore.keyOf(input.system, input.sourceColumn, input.canonical);
    const existing = this.entries.get(key);
    const at = (input.at ?? new Date()).toISOString();
    const next: LearnedMapping = existing
      ? { ...existing, acceptCount: existing.acceptCount + 1, lastAcceptedAt: at }
      : {
          system: input.system,
          sourceColumn: input.sourceColumn,
          canonical: input.canonical,
          entity: input.entity,
          acceptCount: 1,
          lastAcceptedAt: at,
        };
    this.entries.set(key, next);
    return next;
  }

  async dumpAll(): Promise<readonly LearnedMapping[]> {
    this.dumpAllCount += 1;
    if (this.failHydrate) throw new Error("hydrate failure");
    return [...this.entries.values()];
  }

  async loadAll(entries: readonly LearnedMapping[]): Promise<void> {
    for (const e of entries) {
      const key = FakeAsyncStore.keyOf(e.system, e.sourceColumn, e.canonical);
      this.entries.set(key, { ...e });
    }
  }

  async size(): Promise<number> {
    const distinct = new Set<string>();
    for (const m of this.entries.values())
      distinct.add(`${m.system}::${m.sourceColumn.trim().toLowerCase()}`);
    return distinct.size;
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }

  async ensureSchema(): Promise<void> {
    /* no-op */
  }
}

function buildCached(remote: FakeAsyncStore, opts: { hydrateOnStart?: boolean } = {}) {
  const onPersistError = vi.fn();
  const cached = new CachedPostgresLearningStore(
    {
      connectionString: "postgres://x",
      hydrateOnStart: opts.hydrateOnStart ?? true,
      onPersistError,
    },
    remote
  );
  return { cached, onPersistError };
}

describe("CachedPostgresLearningStore", () => {
  it("hydrates the cache from remote on construction", async () => {
    const remote = new FakeAsyncStore();
    await remote.loadAll([
      {
        system: "sits",
        sourceColumn: "stu_id",
        canonical: "Person.studentId",
        entity: "Person",
        acceptCount: 5,
        lastAcceptedAt: "2026-05-25T10:00:00.000Z",
      },
    ]);
    const { cached } = buildCached(remote);
    await cached.whenReady();
    expect(cached.size()).toBe(1);
    const hit = cached.lookup("sits", "stu_id");
    expect(hit?.acceptCount).toBe(5);
    expect(remote.dumpAllCount).toBe(1);
  });

  it("hydrateOnStart=false leaves the cache empty until manually loaded", async () => {
    const remote = new FakeAsyncStore();
    await remote.loadAll([
      {
        system: "sits",
        sourceColumn: "stu_id",
        canonical: "Person.studentId",
        entity: "Person",
        acceptCount: 1,
        lastAcceptedAt: "2026-05-25T10:00:00.000Z",
      },
    ]);
    const { cached } = buildCached(remote, { hydrateOnStart: false });
    await cached.whenReady();
    expect(cached.size()).toBe(0);
    await cached.refresh();
    expect(cached.size()).toBe(1);
  });

  it("write-through: record() updates cache synchronously and persists to remote", async () => {
    const remote = new FakeAsyncStore();
    const { cached } = buildCached(remote);
    await cached.whenReady();
    const out = cached.record({
      system: "sits",
      sourceColumn: "stu_id",
      canonical: "Person.studentId",
      entity: "Person",
    });
    // Cache hit synchronously
    expect(out.acceptCount).toBe(1);
    expect(cached.lookup("sits", "stu_id")?.canonical).toBe("Person.studentId");
    // Remote write happens asynchronously — flush waits
    await cached.flush();
    expect(remote.recordCount).toBe(1);
  });

  it("flush() awaits all pending persist calls", async () => {
    const remote = new FakeAsyncStore();
    const { cached } = buildCached(remote);
    await cached.whenReady();
    for (let i = 0; i < 5; i += 1) {
      cached.record({
        system: "sits",
        sourceColumn: `col_${i}`,
        canonical: "Person.studentId",
        entity: "Person",
      });
    }
    await cached.flush();
    expect(remote.recordCount).toBe(5);
  });

  it("refresh() re-pulls from remote and replaces cache contents", async () => {
    const remote = new FakeAsyncStore();
    const { cached } = buildCached(remote);
    await cached.whenReady();
    expect(cached.size()).toBe(0);
    // Out-of-band correction lands in remote (e.g. another pod)
    await remote.loadAll([
      {
        system: "banner",
        sourceColumn: "spriden_id",
        canonical: "Person.studentId",
        entity: "Person",
        acceptCount: 2,
        lastAcceptedAt: "2026-05-26T09:00:00.000Z",
      },
    ]);
    expect(cached.size()).toBe(0); // not yet visible
    await cached.refresh();
    expect(cached.size()).toBe(1);
    expect(cached.lookup("banner", "spriden_id")?.acceptCount).toBe(2);
  });

  it("onPersistError fires when a remote record() fails", async () => {
    const remote = new FakeAsyncStore();
    const { cached, onPersistError } = buildCached(remote);
    await cached.whenReady();
    remote.failNextRecord = true;
    cached.record({
      system: "sits",
      sourceColumn: "stu_id",
      canonical: "Person.studentId",
      entity: "Person",
    });
    await cached.flush();
    expect(onPersistError).toHaveBeenCalledTimes(1);
    const [err, input] = onPersistError.mock.calls[0]!;
    expect((err as Error).message).toMatch(/simulated remote failure/);
    expect((input as RecordCorrectionInput).sourceColumn).toBe("stu_id");
  });

  it("onPersistError fires when hydration fails (cache stays empty, suggester still works)", async () => {
    const remote = new FakeAsyncStore();
    remote.failHydrate = true;
    const { cached, onPersistError } = buildCached(remote);
    await cached.whenReady();
    expect(cached.size()).toBe(0);
    expect(onPersistError).toHaveBeenCalledTimes(1);
    expect((onPersistError.mock.calls[0]![0] as Error).message).toMatch(/hydrate/);
  });

  it("integrates with SchemaSuggester — learned cache hit served synchronously", async () => {
    const remote = new FakeAsyncStore();
    const { cached } = buildCached(remote);
    await cached.whenReady();
    cached.record({
      system: "sits",
      sourceColumn: "stu_dob_iso",
      canonical: "Person.dateOfBirth",
      entity: "Person",
    });
    const suggester = new SchemaSuggester({ learningStore: cached });
    const result = suggester.suggest({
      system: "sits",
      columns: ["stu_dob_iso"],
    });
    const first = result[0]!;
    expect(isFieldSuggestion(first)).toBe(true);
    if (!isFieldSuggestion(first)) throw new Error("expected field suggestion");
    expect(first.canonical).toBe("Person.dateOfBirth");
    expect(first.rationale).toMatch(/learned/);
  });

  it("clear() empties cache and remote", async () => {
    const remote = new FakeAsyncStore();
    await remote.loadAll([
      {
        system: "sits",
        sourceColumn: "stu_id",
        canonical: "Person.studentId",
        entity: "Person",
        acceptCount: 1,
        lastAcceptedAt: "2026-05-25T10:00:00.000Z",
      },
    ]);
    const { cached } = buildCached(remote);
    await cached.whenReady();
    expect(cached.size()).toBe(1);
    cached.clear();
    await cached.flush();
    expect(cached.size()).toBe(0);
    expect(await remote.size()).toBe(0);
  });

  it("loadAll mirrors entries to remote and cache", async () => {
    const remote = new FakeAsyncStore();
    const { cached } = buildCached(remote);
    await cached.whenReady();
    cached.loadAll([
      {
        system: "sits",
        sourceColumn: "stu_id",
        canonical: "Person.studentId",
        entity: "Person",
        acceptCount: 3,
        lastAcceptedAt: "2026-05-26T10:00:00.000Z",
      },
    ]);
    expect(cached.size()).toBe(1);
    await cached.flush();
    expect(await remote.size()).toBe(1);
  });

  it("isHydrated() reflects state across hydrate / refresh", async () => {
    const remote = new FakeAsyncStore();
    const { cached } = buildCached(remote, { hydrateOnStart: false });
    await cached.whenReady();
    expect(cached.isHydrated()).toBe(false);
    await cached.refresh();
    expect(cached.isHydrated()).toBe(true);
  });
});
