/**
 * Filesystem-backed {@link LearningStore}.
 *
 * Wraps {@link MemoryLearningStore} so all read paths stay O(1) and the
 * recommendation ranking logic remains unchanged — every write is then
 * mirrored to a JSON file on disk so corrections survive process
 * restarts, CI runs, and engineer hand-offs.
 *
 * Write semantics:
 *   - Each `record()` triggers a synchronous flush (the suggester is
 *     called from interactive engineer workflows, so flushes are rare
 *     enough that batching adds complexity without payoff).
 *   - Flushes are atomic-ish: write to `<path>.tmp` then rename. On
 *     Linux/macOS this is a real atomic move; on Windows it's best-effort.
 *   - `loadAll()` replaces in-memory contents; on construction the
 *     store auto-loads if the file already exists.
 *
 * Concurrency: single-writer. Two processes pointing at the same file
 * will overwrite each other on flush. The intended deployment is one
 * suggester process per workspace.
 *
 * On-disk shape (v1):
 *
 *   {
 *     "version": 1,
 *     "savedAt": "<ISO timestamp of write>",
 *     "entries": [LearnedMapping, ...]
 *   }
 */
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { MemoryLearningStore } from "./learning.js";
import type { LearnedMapping, LearningStore, RecordCorrectionInput } from "./learning.js";
import type { CrosswalkSystem } from "./types.js";

export const FS_LEARNING_STORE_VERSION = 1 as const;

export interface FsLearningStoreFile {
  version: typeof FS_LEARNING_STORE_VERSION;
  savedAt: string;
  entries: LearnedMapping[];
}

export interface FsLearningStoreOptions {
  /** Absolute or relative path to the JSON file. Parent dir auto-created. */
  filePath: string;
  /**
   * If true and the file already exists, load its contents into memory
   * on construction. Default true — this is the whole point.
   */
  autoLoad?: boolean;
  /**
   * Override the clock — only used by tests for deterministic
   * `savedAt` values. Returns ms since epoch. Defaults to {@link Date.now}.
   */
  now?: () => number;
}

/**
 * Persistent learning store backed by a single JSON file.
 *
 * Delegates all read paths to an internal {@link MemoryLearningStore}
 * and persists on every `record()` / `loadAll()` / `clear()`.
 */
export class FsLearningStore implements LearningStore {
  private readonly memory = new MemoryLearningStore();
  private readonly filePath: string;
  private readonly now: () => number;

  constructor(options: FsLearningStoreOptions) {
    this.filePath = resolve(options.filePath);
    this.now = options.now ?? (() => Date.now());

    const autoLoad = options.autoLoad ?? true;
    if (autoLoad && existsSync(this.filePath)) {
      this.reloadFromDisk();
    }
  }

  /** Resolved absolute path to the JSON file. */
  getFilePath(): string {
    return this.filePath;
  }

  lookup(system: CrosswalkSystem, sourceColumn: string): LearnedMapping | undefined {
    return this.memory.lookup(system, sourceColumn);
  }

  record(input: RecordCorrectionInput): LearnedMapping {
    const out = this.memory.record(input);
    this.flush();
    return out;
  }

  dumpAll(): readonly LearnedMapping[] {
    return this.memory.dumpAll();
  }

  loadAll(entries: readonly LearnedMapping[]): void {
    this.memory.loadAll(entries);
    this.flush();
  }

  size(): number {
    return this.memory.size();
  }

  clear(): void {
    this.memory.clear();
    this.flush();
  }

  /**
   * Re-read the JSON file from disk and replace in-memory state. Useful
   * when another process has rewritten the file out-of-band (rare —
   * single-writer is the intended deployment) or in tests.
   */
  reloadFromDisk(): void {
    if (!existsSync(this.filePath)) {
      this.memory.clear();
      return;
    }
    const raw = readFileSync(this.filePath, "utf8");
    const parsed = parseAndValidate(raw, this.filePath);
    this.memory.clear();
    this.memory.loadAll(parsed.entries);
  }

  private flush(): void {
    const payload: FsLearningStoreFile = {
      version: FS_LEARNING_STORE_VERSION,
      savedAt: new Date(this.now()).toISOString(),
      entries: [...this.memory.dumpAll()],
    };
    const json = JSON.stringify(payload, null, 2);
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, json, { encoding: "utf8" });
    renameSync(tmp, this.filePath);
  }
}

/**
 * Parse + validate a learning store file. Throws a descriptive error
 * on bad shape. Exported for tests + tooling.
 */
export function parseAndValidate(raw: string, path: string): FsLearningStoreFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`FsLearningStore: ${path} is not valid JSON: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`FsLearningStore: ${path} root must be an object`);
  }
  const obj = parsed as Record<string, unknown>;
  if (obj["version"] !== FS_LEARNING_STORE_VERSION) {
    throw new Error(
      `FsLearningStore: ${path} version mismatch — expected ${FS_LEARNING_STORE_VERSION}, got ${String(obj["version"])}`
    );
  }
  const entries = obj["entries"];
  if (!Array.isArray(entries)) {
    throw new Error(`FsLearningStore: ${path}.entries must be an array`);
  }
  for (const [i, e] of entries.entries()) {
    if (!isLearnedMapping(e)) {
      throw new Error(`FsLearningStore: ${path}.entries[${i}] has an invalid shape`);
    }
  }
  const savedAt = typeof obj["savedAt"] === "string" ? obj["savedAt"] : new Date(0).toISOString();
  return {
    version: FS_LEARNING_STORE_VERSION,
    savedAt,
    entries: entries as LearnedMapping[],
  };
}

function isLearnedMapping(v: unknown): v is LearnedMapping {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["system"] === "string" &&
    typeof o["sourceColumn"] === "string" &&
    typeof o["canonical"] === "string" &&
    typeof o["entity"] === "string" &&
    typeof o["acceptCount"] === "number" &&
    typeof o["lastAcceptedAt"] === "string"
  );
}
