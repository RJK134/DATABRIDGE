import { describe, it, expect } from "vitest";
import { MemoryLearningStore, learnedConfidence, SchemaSuggester } from "../index.js";
import { isFieldSuggestion } from "../types.js";

describe("MemoryLearningStore", () => {
  it("starts empty", () => {
    const s = new MemoryLearningStore();
    expect(s.size()).toBe(0);
    expect(s.lookup("sits", "stu_dob")).toBeUndefined();
  });

  it("records and looks up a single correction", () => {
    const s = new MemoryLearningStore();
    s.record({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "dateOfBirth",
      entity: "Person",
      at: new Date("2026-05-26T10:00:00Z"),
    });
    const got = s.lookup("sits", "stu_dob");
    expect(got).toBeDefined();
    expect(got?.canonical).toBe("dateOfBirth");
    expect(got?.entity).toBe("Person");
    expect(got?.acceptCount).toBe(1);
    expect(got?.lastAcceptedAt).toBe("2026-05-26T10:00:00.000Z");
  });

  it("normalises the source column so casing/whitespace don't fragment", () => {
    const s = new MemoryLearningStore();
    s.record({
      system: "sits",
      sourceColumn: "STU_DOB",
      canonical: "dateOfBirth",
      entity: "Person",
      at: new Date("2026-05-26T10:00:00Z"),
    });
    expect(s.lookup("sits", "stu_dob")).toBeDefined();
    expect(s.lookup("sits", "  STU_DOB  ")).toBeDefined();
  });

  it("increments acceptCount on repeated records of the same canonical", () => {
    const s = new MemoryLearningStore();
    for (let i = 0; i < 3; i++) {
      s.record({
        system: "sits",
        sourceColumn: "stu_dob",
        canonical: "dateOfBirth",
        entity: "Person",
        at: new Date(`2026-05-${20 + i}T10:00:00Z`),
      });
    }
    const got = s.lookup("sits", "stu_dob");
    expect(got?.acceptCount).toBe(3);
    expect(got?.lastAcceptedAt).toBe("2026-05-22T10:00:00.000Z");
  });

  it("when multiple canonicals are recorded, returns the most-accepted", () => {
    const s = new MemoryLearningStore();
    s.record({
      system: "sits",
      sourceColumn: "stu_name",
      canonical: "fullName",
      entity: "Person",
      at: new Date("2026-05-20T10:00:00Z"),
    });
    s.record({
      system: "sits",
      sourceColumn: "stu_name",
      canonical: "surname",
      entity: "Person",
      at: new Date("2026-05-21T10:00:00Z"),
    });
    s.record({
      system: "sits",
      sourceColumn: "stu_name",
      canonical: "surname",
      entity: "Person",
      at: new Date("2026-05-22T10:00:00Z"),
    });
    expect(s.lookup("sits", "stu_name")?.canonical).toBe("surname");
    expect(s.lookup("sits", "stu_name")?.acceptCount).toBe(2);
  });

  it("system is part of the key — same column under different systems is independent", () => {
    const s = new MemoryLearningStore();
    s.record({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "dateOfBirth",
      entity: "Person",
      at: new Date("2026-05-26T10:00:00Z"),
    });
    s.record({
      system: "banner",
      sourceColumn: "stu_dob",
      canonical: "dobIso",
      entity: "Person",
      at: new Date("2026-05-26T10:00:00Z"),
    });
    expect(s.lookup("sits", "stu_dob")?.canonical).toBe("dateOfBirth");
    expect(s.lookup("banner", "stu_dob")?.canonical).toBe("dobIso");
  });

  it("dumpAll + loadAll round-trips for persistence", () => {
    const a = new MemoryLearningStore();
    a.record({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "dateOfBirth",
      entity: "Person",
      at: new Date("2026-05-26T10:00:00Z"),
    });
    a.record({
      system: "banner",
      sourceColumn: "spriden_id",
      canonical: "studentId",
      entity: "Person",
      at: new Date("2026-05-26T10:00:00Z"),
    });

    const b = new MemoryLearningStore();
    b.loadAll(a.dumpAll());
    expect(b.size()).toBe(2);
    expect(b.lookup("sits", "stu_dob")?.canonical).toBe("dateOfBirth");
    expect(b.lookup("banner", "spriden_id")?.canonical).toBe("studentId");
  });

  it("clear() empties the store", () => {
    const s = new MemoryLearningStore();
    s.record({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "dateOfBirth",
      entity: "Person",
    });
    expect(s.size()).toBe(1);
    s.clear();
    expect(s.size()).toBe(0);
    expect(s.lookup("sits", "stu_dob")).toBeUndefined();
  });
});

describe("learnedConfidence()", () => {
  it("is zero for zero acceptances", () => {
    expect(learnedConfidence(0)).toBe(0);
  });
  it("starts at ~0.85 for one acceptance and grows monotonically", () => {
    const c1 = learnedConfidence(1);
    const c2 = learnedConfidence(2);
    const c5 = learnedConfidence(5);
    expect(c1).toBeGreaterThanOrEqual(0.85);
    expect(c2).toBeGreaterThan(c1);
    expect(c5).toBeGreaterThan(c2);
  });
  it("caps at 0.98", () => {
    expect(learnedConfidence(100)).toBeLessThanOrEqual(0.98);
  });
});

describe("SchemaSuggester with learning store", () => {
  it("learned mapping outranks deterministic heuristics", () => {
    const suggester = new SchemaSuggester();
    // Without learning: 'stu_dob' picks dateOfBirth via Jaccard
    const before = suggester.suggest({
      columns: ["stu_dob"],
      system: "sits",
    })[0];
    expect(before).toBeDefined();

    // Engineer corrects to a different canonical (synthetic example —
    // pretend the institution maps this to a wrapper field `dobIso`).
    // We deliberately pick a canonical NOT in the corpus to prove
    // learning supersedes heuristics.
    suggester.recordCorrection({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "dobIso",
      entity: "Person",
      at: new Date("2026-05-26T10:00:00Z"),
    });

    const after = suggester.suggest({
      columns: ["stu_dob"],
      system: "sits",
    })[0];
    expect(after).toBeDefined();
    expect(isFieldSuggestion(after!)).toBe(true);
    if (isFieldSuggestion(after!)) {
      expect(after.canonical).toBe("dobIso");
      expect(after.rationale).toMatch(/learned from 1 prior acceptance/);
      expect(after.score).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("learned confidence grows with repeated acceptances", () => {
    const suggester = new SchemaSuggester();
    const ts = (n: number) => new Date(`2026-05-${10 + n}T10:00:00Z`);
    suggester.recordCorrection({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "dobIso",
      entity: "Person",
      at: ts(1),
    });
    const oneShot = suggester.suggest({ columns: ["stu_dob"], system: "sits" })[0];
    expect(oneShot).toBeDefined();

    for (let i = 0; i < 4; i++) {
      suggester.recordCorrection({
        system: "sits",
        sourceColumn: "stu_dob",
        canonical: "dobIso",
        entity: "Person",
        at: ts(2 + i),
      });
    }
    const fiveShot = suggester.suggest({ columns: ["stu_dob"], system: "sits" })[0];
    expect(fiveShot).toBeDefined();
    if (isFieldSuggestion(oneShot!) && isFieldSuggestion(fiveShot!)) {
      expect(fiveShot.score).toBeGreaterThan(oneShot.score);
    }
  });

  it("learned mapping only applies when entity is in scope", () => {
    const suggester = new SchemaSuggester();
    suggester.recordCorrection({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "dobIso",
      entity: "Person",
      at: new Date("2026-05-26T10:00:00Z"),
    });
    // Scope excludes Person — learned mapping ignored, deterministic
    // heuristic still runs against other entities (likely yielding "no
    // match" for this DOB column).
    const result = suggester.suggest({
      columns: ["stu_dob"],
      system: "sits",
      entityScope: ["Programme"],
    })[0];
    expect(result).toBeDefined();
    if (isFieldSuggestion(result!)) {
      expect(result.canonical).not.toBe("dobIso");
    }
  });

  it("getLearningStore exposes the underlying store for persistence", () => {
    const suggester = new SchemaSuggester();
    suggester.recordCorrection({
      system: "sits",
      sourceColumn: "stu_dob",
      canonical: "dobIso",
      entity: "Person",
      at: new Date("2026-05-26T10:00:00Z"),
    });
    const store = suggester.getLearningStore();
    expect(store.size()).toBe(1);
    const dump = store.dumpAll();
    expect(dump).toHaveLength(1);
    expect(dump[0]?.canonical).toBe("dobIso");
  });

  it("an injected learning store can be pre-loaded with corrections", () => {
    const store = new MemoryLearningStore();
    store.loadAll([
      {
        system: "sits",
        sourceColumn: "stu_dob",
        canonical: "dobIso",
        entity: "Person",
        acceptCount: 7,
        lastAcceptedAt: "2026-05-20T00:00:00.000Z",
      },
    ]);
    const suggester = new SchemaSuggester({ learningStore: store });
    const result = suggester.suggest({ columns: ["stu_dob"], system: "sits" })[0];
    expect(result).toBeDefined();
    if (isFieldSuggestion(result!)) {
      expect(result.canonical).toBe("dobIso");
      expect(result.rationale).toMatch(/learned from 7 prior acceptances/);
    }
  });
});
