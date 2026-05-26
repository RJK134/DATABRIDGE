import { describe, it, expect } from "vitest";
import { NarrativeSlotsZ, sanitiseSlots, safeTruncate, NARRATIVE_SCHEMA } from "../template.js";

const ok = {
  headline_sentence: "We detected 314 findings, 23 of them critical, across 4 source systems.",
  severity_breakdown_bullets: ["CRITICAL: 23", "ERROR: 105", "WARN: 186"],
  top_cluster_root_cause:
    "Codeset drift in Banner STVMAJR — 1.2 percent of rows still reference the legacy XX_LEGACY major code.",
  recommended_next_actions: [
    { owner: "Registry", action: "Refresh the STVMAJR codeset and re-run the audit.", priority: 1 },
    { owner: "Banner admin", action: "Disable XX_LEGACY in the staging schema." },
  ],
};

describe("NarrativeSlotsZ", () => {
  it("accepts a valid slot set", () => {
    expect(() => NarrativeSlotsZ.parse(ok)).not.toThrow();
  });

  it("rejects empty severity_breakdown_bullets", () => {
    expect(() =>
      NarrativeSlotsZ.parse({ ...ok, severity_breakdown_bullets: [] }),
    ).toThrow();
  });

  it("rejects markdown / HTML in any slot", () => {
    expect(() =>
      NarrativeSlotsZ.parse({ ...ok, headline_sentence: "**bold**" }),
    ).toThrow();
    expect(() =>
      NarrativeSlotsZ.parse({ ...ok, top_cluster_root_cause: "<script>alert(1)</script>" }),
    ).toThrow();
    expect(() =>
      NarrativeSlotsZ.parse({
        ...ok,
        severity_breakdown_bullets: ["normal", "<b>html</b>"],
      }),
    ).toThrow();
  });

  it("rejects headlines over 220 characters", () => {
    expect(() =>
      NarrativeSlotsZ.parse({ ...ok, headline_sentence: "x".repeat(221) }),
    ).toThrow();
  });

  it("rejects more than 6 bullets", () => {
    expect(() =>
      NarrativeSlotsZ.parse({
        ...ok,
        severity_breakdown_bullets: ["a", "b", "c", "d", "e", "f", "g"],
      }),
    ).toThrow();
  });

  it("rejects recommended actions without an owner", () => {
    expect(() =>
      NarrativeSlotsZ.parse({
        ...ok,
        recommended_next_actions: [{ owner: "", action: "x" }],
      }),
    ).toThrow();
  });

  it("rejects recommended actions with markdown-shaped owner", () => {
    expect(() =>
      NarrativeSlotsZ.parse({
        ...ok,
        recommended_next_actions: [{ owner: "[Admin](mailto:x)", action: "x" }],
      }),
    ).toThrow();
  });

  it("rejects priorities outside [1, 5]", () => {
    expect(() =>
      NarrativeSlotsZ.parse({
        ...ok,
        recommended_next_actions: [{ owner: "x", action: "y", priority: 0 }],
      }),
    ).toThrow();
    expect(() =>
      NarrativeSlotsZ.parse({
        ...ok,
        recommended_next_actions: [{ owner: "x", action: "y", priority: 6 }],
      }),
    ).toThrow();
  });
});

describe("sanitiseSlots", () => {
  it("trims trailing whitespace on every slot", () => {
    const s = sanitiseSlots(
      NarrativeSlotsZ.parse({
        ...ok,
        headline_sentence: "  We found things.  ",
      }),
    );
    expect(s.headline_sentence).toBe("We found things.");
  });

  it("preserves priority when supplied", () => {
    const s = sanitiseSlots(NarrativeSlotsZ.parse(ok));
    expect(s.recommended_next_actions[0]?.priority).toBe(1);
    expect(s.recommended_next_actions[1]?.priority).toBeUndefined();
  });
});

describe("safeTruncate", () => {
  it("returns the input untouched when short enough", () => {
    expect(safeTruncate("hello", 10)).toBe("hello");
  });

  it("truncates at word boundary when possible", () => {
    expect(safeTruncate("hello world foo bar", 12)).toBe("hello world");
  });

  it("falls back to hard cut when no word boundary fits", () => {
    expect(safeTruncate("verylongtokenwithoutspaces", 5)).toBe("veryl");
  });
});

describe("NARRATIVE_SCHEMA", () => {
  it("declares the four required slots", () => {
    expect(NARRATIVE_SCHEMA.jsonSchema).toMatchObject({
      type: "object",
      required: [
        "headline_sentence",
        "severity_breakdown_bullets",
        "top_cluster_root_cause",
        "recommended_next_actions",
      ],
    });
  });
});
