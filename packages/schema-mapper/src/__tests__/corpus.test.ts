import { describe, expect, it } from "vitest";
import { loadBundledCorpus, buildFlatIndex } from "../corpus-loader.js";

describe("loadBundledCorpus", () => {
  it("loads all six entity sections", () => {
    const corpus = loadBundledCorpus();
    expect(corpus.version).toMatch(/^1\.0\.0/);
    const entities = corpus.sections.map((s) => s.entity);
    expect(entities).toEqual([
      "Person",
      "ProgrammeEnrolment",
      "ModuleEnrolment",
      "ModuleResult",
      "Award",
      "Application",
    ]);
  });

  it("Person section has expected canonical fields", () => {
    const corpus = loadBundledCorpus();
    const person = corpus.sections.find((s) => s.entity === "Person")!;
    const canonicals = person.fields.map((f) => f.canonical);
    expect(canonicals).toContain("surname");
    expect(canonicals).toContain("dateOfBirth");
    expect(canonicals).toContain("ethnicity");
  });

  it("uses §6 numbering", () => {
    const corpus = loadBundledCorpus();
    expect(corpus.sections[0]!.section).toBe("§6");
    expect(corpus.sections[5]!.section).toBe("§11");
  });
});

describe("buildFlatIndex", () => {
  it("emits one entry per (canonical, system) with non-null source", () => {
    const corpus = loadBundledCorpus();
    const index = buildFlatIndex(corpus);
    // Sanity: many entries
    expect(index.length).toBeGreaterThan(50);
    // Banner-only fields (no SITS) should yield only one entry
    const sexualOrientation = index.filter((e) => e.canonical === "sexualOrientation");
    // Banner = null, SITS present → only sits entry
    expect(sexualOrientation.length).toBe(1);
    expect(sexualOrientation[0]!.system).toBe("sits");
  });

  it("preserves notes when present", () => {
    const corpus = loadBundledCorpus();
    const index = buildFlatIndex(corpus);
    const surname = index.find((e) => e.canonical === "surname" && e.system === "banner")!;
    expect(surname.notes).toMatch(/Upper-case/);
  });
});
