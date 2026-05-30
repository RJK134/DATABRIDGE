/**
 * Filesystem-backed learning-store tests.
 *
 * Uses real temp directories — operations are tiny and deterministic.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FsLearningStore, FS_LEARNING_STORE_VERSION, parseFsLearningStoreFile } from "../index.js";
import { SchemaSuggester } from "../suggester.js";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "databridge-fs-learning-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function tmpFile(name = "store.json") {
  return join(workDir, name);
}

describe("FsLearningStore — basic persistence", () => {
  it("creates the file on first record() and persists the entry", () => {
    const path = tmpFile();
    const store = new FsLearningStore({ filePath: path });
    expect(existsSync(path)).toBe(false);

    store.record({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "Person.dateOfBirth",
      entity: "Person",
      at: new Date("2026-01-01T00:00:00Z"),
    });

    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { version: number; entries: unknown[] };
    expect(parsed.version).toBe(FS_LEARNING_STORE_VERSION);
    expect(parsed.entries).toHaveLength(1);
  });

  it("auto-creates parent directories", () => {
    const path = join(workDir, "nested", "deep", "store.json");
    const store = new FsLearningStore({ filePath: path });
    store.record({
      system: "banner",
      sourceColumn: "spriden_id",
      canonical: "Person.studentId",
      entity: "Person",
    });
    expect(existsSync(path)).toBe(true);
  });

  it("loads an existing file on construction (round trip)", () => {
    const path = tmpFile();
    const a = new FsLearningStore({ filePath: path });
    a.record({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "Person.dateOfBirth",
      entity: "Person",
    });
    a.record({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "Person.dateOfBirth",
      entity: "Person",
    });

    // Spawn a fresh store backed by the same file.
    const b = new FsLearningStore({ filePath: path });
    expect(b.size()).toBe(1);
    const hit = b.lookup("sits", "stu_dob");
    expect(hit).toBeDefined();
    expect(hit?.acceptCount).toBe(2);
    expect(hit?.canonical).toBe("Person.dateOfBirth");
  });

  it("autoLoad=false skips reading an existing file", () => {
    const path = tmpFile();
    writeFileSync(
      path,
      JSON.stringify({
        version: FS_LEARNING_STORE_VERSION,
        savedAt: "2026-01-01T00:00:00.000Z",
        entries: [
          {
            system: "sits",
            sourceColumn: "stu_dob",
            canonical: "Person.dateOfBirth",
            entity: "Person",
            acceptCount: 9,
            lastAcceptedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      })
    );
    const store = new FsLearningStore({ filePath: path, autoLoad: false });
    expect(store.size()).toBe(0);
  });

  it("clear() empties the in-memory store and rewrites the file", () => {
    const path = tmpFile();
    const store = new FsLearningStore({ filePath: path });
    store.record({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "Person.dateOfBirth",
      entity: "Person",
    });
    expect(store.size()).toBe(1);
    store.clear();
    expect(store.size()).toBe(0);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { entries: unknown[] };
    expect(parsed.entries).toEqual([]);
  });

  it("reloadFromDisk() picks up out-of-band edits", () => {
    const path = tmpFile();
    const store = new FsLearningStore({ filePath: path });
    store.record({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "Person.dateOfBirth",
      entity: "Person",
    });
    // Out-of-band: append an entry by rewriting the file.
    writeFileSync(
      path,
      JSON.stringify({
        version: FS_LEARNING_STORE_VERSION,
        savedAt: "2026-01-01T00:00:00.000Z",
        entries: [
          {
            system: "banner",
            sourceColumn: "spriden_id",
            canonical: "Person.studentId",
            entity: "Person",
            acceptCount: 5,
            lastAcceptedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      })
    );
    store.reloadFromDisk();
    expect(store.size()).toBe(1);
    const hit = store.lookup("banner", "spriden_id");
    expect(hit?.acceptCount).toBe(5);
  });

  it("uses an injected clock for savedAt", () => {
    const path = tmpFile();
    const store = new FsLearningStore({
      filePath: path,
      now: () => Date.parse("2026-05-26T18:00:00Z"),
    });
    store.record({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "Person.dateOfBirth",
      entity: "Person",
    });
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { savedAt: string };
    expect(parsed.savedAt).toBe("2026-05-26T18:00:00.000Z");
  });
});

describe("FsLearningStore — parseAndValidate", () => {
  it("rejects non-JSON content with a descriptive error", () => {
    expect(() => parseFsLearningStoreFile("not json", "/x")).toThrow(/not valid JSON/);
  });

  it("rejects mismatched version", () => {
    const raw = JSON.stringify({ version: 999, entries: [] });
    expect(() => parseFsLearningStoreFile(raw, "/x")).toThrow(/version mismatch/);
  });

  it("rejects non-array entries", () => {
    const raw = JSON.stringify({ version: FS_LEARNING_STORE_VERSION, entries: {} });
    expect(() => parseFsLearningStoreFile(raw, "/x")).toThrow(/must be an array/);
  });

  it("rejects malformed entries", () => {
    const raw = JSON.stringify({
      version: FS_LEARNING_STORE_VERSION,
      entries: [{ system: "sits" }],
    });
    expect(() => parseFsLearningStoreFile(raw, "/x")).toThrow(/invalid shape/);
  });
});

describe("FsLearningStore — SchemaSuggester integration", () => {
  it("learned mappings survive a process restart and outrank heuristics", () => {
    const path = tmpFile();

    // Process 1 — engineer corrects a column.
    {
      const fsStore = new FsLearningStore({ filePath: path });
      const suggester = new SchemaSuggester({ learningStore: fsStore });
      suggester.recordCorrection({
        system: "sits",
        sourceColumn: "stu_dob_v2",
        canonical: "Person.dateOfBirth",
        entity: "Person",
      });
    }

    // Process 2 — fresh suggester with a fresh fs-backed store at same path.
    const fsStore2 = new FsLearningStore({ filePath: path });
    const suggester2 = new SchemaSuggester({ learningStore: fsStore2 });
    const results = suggester2.suggest({
      system: "sits",
      columns: ["stu_dob_v2"],
      entityScope: ["Person"],
    });
    expect(results).toHaveLength(1);
    const r = results[0];
    if (r && "canonical" in r) {
      expect(r.canonical).toBe("Person.dateOfBirth");
      expect(r.rationale.toLowerCase()).toMatch(/learned/);
    } else {
      throw new Error("expected a FieldSuggestion, got NoMatch");
    }
  });
});
