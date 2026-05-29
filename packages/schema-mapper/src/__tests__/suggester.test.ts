import { describe, expect, it } from "vitest";
import { SchemaSuggester, isFieldSuggestion, jaccard, suggestionsToMd, tokens } from "../index.js";

describe("tokens", () => {
  it("splits snake_case", () => {
    expect(tokens("SPRIDEN_LAST_NAME")).toEqual(new Set(["spriden", "last", "name"]));
  });
  it("splits camelCase", () => {
    expect(tokens("dateOfBirth")).toEqual(new Set(["date", "of", "birth"]));
  });
  it("drops length-1 tokens", () => {
    expect(tokens("a_b_cd")).toEqual(new Set(["cd"]));
  });
});

describe("jaccard", () => {
  it("returns 0 when either set is empty", () => {
    expect(jaccard(new Set([]), new Set(["a"]))).toBe(0);
  });
  it("returns 1 for identical sets", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });
  it("computes correctly for overlap", () => {
    // |int| = 1, |union| = 3 → 1/3
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "c"]))).toBeCloseTo(1 / 3);
  });
});

describe("SchemaSuggester — Banner side", () => {
  const sugg = new SchemaSuggester();

  it("maps SPRIDEN_LAST_NAME → surname with high confidence", () => {
    const out = sugg.suggest({
      columns: ["SPRIDEN_LAST_NAME"],
      system: "banner",
    });
    const r = out[0]!;
    expect(isFieldSuggestion(r)).toBe(true);
    if (isFieldSuggestion(r)) {
      expect(r.canonical).toBe("surname");
      expect(r.entity).toBe("Person");
      expect(r.score).toBeGreaterThan(0.5);
    }
  });

  it("maps SPBPERS_BIRTH_DATE → dateOfBirth", () => {
    const out = sugg.suggest({
      columns: ["SPBPERS_BIRTH_DATE"],
      system: "banner",
    });
    const r = out[0]!;
    if (isFieldSuggestion(r)) {
      expect(r.canonical).toBe("dateOfBirth");
    } else {
      throw new Error("expected a suggestion");
    }
  });

  it("returns NoSuggestion for a nonsense column", () => {
    const out = sugg.suggest({
      columns: ["TOTALLY_BOGUS_COLUMN_XYZ"],
      system: "banner",
    });
    expect(isFieldSuggestion(out[0]!)).toBe(false);
  });

  it("respects entity scope", () => {
    const out = sugg.suggest({
      columns: ["SPRIDEN_LAST_NAME"],
      system: "banner",
      entityScope: ["Award"], // wrong entity for surname → should fail
    });
    expect(isFieldSuggestion(out[0]!)).toBe(false);
  });

  it("respects minScore threshold", () => {
    const out = sugg.suggest({
      columns: ["SPRIDEN_LAST_NAME"],
      system: "banner",
      minScore: 0.99, // impossibly high
    });
    expect(isFieldSuggestion(out[0]!)).toBe(false);
  });
});

describe("SchemaSuggester — SITS side", () => {
  const sugg = new SchemaSuggester();

  it("maps mst_surn → surname", () => {
    const out = sugg.suggest({
      columns: ["mst_surn"],
      system: "sits",
    });
    const r = out[0]!;
    expect(isFieldSuggestion(r)).toBe(true);
    if (isFieldSuggestion(r)) {
      expect(r.canonical).toBe("surname");
    }
  });

  it("maps cap_dec1 → decision-family field on Application", () => {
    const out = sugg.suggest({
      columns: ["cap_dec1"],
      system: "sits",
    });
    const r = out[0]!;
    if (isFieldSuggestion(r)) {
      // Both `decision` and `applicationStatus` source from cap_dec1; either is
      // acceptable as the top match — the suggester surfaces the other as an
      // alternative for the engineer.
      expect(["decision", "applicationStatus"]).toContain(r.canonical);
      expect(r.entity).toBe("Application");
      const alts = r.alternatives.map((a) => a.canonical);
      expect([...alts, r.canonical]).toEqual(expect.arrayContaining(["decision"]));
    } else {
      throw new Error("expected a suggestion");
    }
  });

  it("maps saw_grdd → conferralDate", () => {
    const out = sugg.suggest({
      columns: ["saw_grdd"],
      system: "sits",
    });
    const r = out[0]!;
    if (isFieldSuggestion(r)) {
      expect(r.canonical).toBe("conferralDate");
    } else {
      throw new Error("expected a suggestion");
    }
  });
});

describe("SchemaSuggester — alternatives + rationale", () => {
  it("includes alternatives ordered by score", () => {
    const sugg = new SchemaSuggester();
    const out = sugg.suggest({
      columns: ["SPRIDEN_ID"],
      system: "banner",
    });
    const r = out[0]!;
    if (isFieldSuggestion(r)) {
      // No requirement on max number, but length should be ≤ 3
      expect(r.alternatives.length).toBeLessThanOrEqual(3);
      // Scores monotonically decreasing
      for (let i = 1; i < r.alternatives.length; i++) {
        expect(r.alternatives[i]!.score).toBeLessThanOrEqual(r.alternatives[i - 1]!.score);
      }
    }
  });

  it("emits a human-readable rationale", () => {
    const sugg = new SchemaSuggester();
    const out = sugg.suggest({
      columns: ["SPRIDEN_LAST_NAME"],
      system: "banner",
    });
    const r = out[0]!;
    if (isFieldSuggestion(r)) {
      expect(r.rationale.length).toBeGreaterThan(0);
    }
  });
});

describe("suggestionsToMd", () => {
  it("renders a table including no-match rows", () => {
    const sugg = new SchemaSuggester();
    const out = sugg.suggest({
      columns: ["SPRIDEN_LAST_NAME", "WHATEVER_NOOP"],
      system: "banner",
    });
    const md = suggestionsToMd(out);
    expect(md).toContain("source");
    expect(md).toContain("surname");
    expect(md).toContain("WHATEVER_NOOP");
    expect(md).toContain("_(none)_");
  });
});

describe("SchemaSuggester — metadata", () => {
  it("exposes corpus version", () => {
    const sugg = new SchemaSuggester();
    expect(sugg.version()).toMatch(/crosswalk/);
  });

  it("lists supported entities", () => {
    const sugg = new SchemaSuggester();
    expect(sugg.entities()).toContain("Person");
    expect(sugg.entities()).toContain("Application");
  });
});
