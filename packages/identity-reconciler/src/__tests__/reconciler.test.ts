import { describe, expect, it } from "vitest";
import {
  buildMergeLogEntry,
  damerauLevenshtein,
  nameSimilarity,
  reconcile,
  scorePair,
} from "../index.js";
import type { PersonRecord } from "../index.js";

const banner = (overrides: Partial<PersonRecord> = {}): PersonRecord => ({
  system: "banner",
  sourceId: "B-1",
  firstName: "Alice",
  lastName: "Smith",
  dateOfBirth: "1999-04-12",
  ...overrides,
});

const sits = (overrides: Partial<PersonRecord> = {}): PersonRecord => ({
  system: "sits",
  sourceId: "S-1",
  firstName: "Alice",
  lastName: "Smith",
  dateOfBirth: "1999-04-12",
  ...overrides,
});

describe("damerauLevenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(damerauLevenshtein("Smith", "smith")).toBe(0);
  });
  it("counts a single transposition as distance 1", () => {
    expect(damerauLevenshtein("Smith", "Smtih")).toBe(1);
  });
  it("counts a substitution as distance 1", () => {
    expect(damerauLevenshtein("Smyth", "Smith")).toBe(1);
  });
  it("nameSimilarity is 1 for identical names", () => {
    expect(nameSimilarity("Alice", "alice")).toBeCloseTo(1);
  });
});

describe("scorePair — exact policy", () => {
  it("matches when husid is shared", () => {
    const a = banner({ husid: "1234567890123" });
    const b = sits({ husid: "1234567890123", lastName: "Different" });
    const cand = scorePair(a, b, { kind: "exact" });
    expect(cand.score).toBe(1);
    expect(cand.confidence).toBe("confident");
    expect(cand.reasons.map((r) => r.code)).toContain("husid-equal");
  });

  it("does NOT match when only fuzzy-style fields overlap", () => {
    const cand = scorePair(banner(), sits(), { kind: "exact" });
    expect(cand.score).toBe(0);
    expect(cand.confidence).toBe("rejected");
  });

  it("matches on overlapping altId tuple", () => {
    const a = banner({
      altIds: [{ system: "sits", type: "stu-code", value: "999" }],
    });
    const b = sits({
      sourceId: "999",
      altIds: [{ system: "sits", type: "stu-code", value: "999" }],
    });
    const cand = scorePair(a, b, { kind: "exact" });
    expect(cand.score).toBe(1);
    expect(cand.confidence).toBe("confident");
  });
});

describe("scorePair — fuzzy policy", () => {
  it("matches on close names + same DOB", () => {
    const a = banner({ lastName: "Smyth" }); // 1 edit from Smith
    const b = sits({ lastName: "Smith" });
    const cand = scorePair(a, b, { kind: "fuzzy" });
    expect(cand.score).toBeGreaterThanOrEqual(0.7);
    expect(["confident", "review"]).toContain(cand.confidence);
  });

  it("rejects when DOB differs and only first names match", () => {
    const a = banner({ firstName: "Alice", lastName: "X", dateOfBirth: "1990-01-01" });
    const b = sits({ firstName: "Alice", lastName: "Y", dateOfBirth: "2001-12-31" });
    const cand = scorePair(a, b, { kind: "fuzzy" });
    expect(cand.confidence).toBe("rejected");
  });

  it("boosts to confident when email also matches", () => {
    const a = banner({ email: "alice@uni.ac.uk" });
    const b = sits({ email: "alice@uni.ac.uk" });
    const cand = scorePair(a, b, { kind: "fuzzy" });
    expect(cand.score).toBeGreaterThanOrEqual(0.9);
    expect(cand.confidence).toBe("confident");
  });
});

describe("scorePair — institutional policy", () => {
  it("matches when all declared fields equal", () => {
    const a = banner({ postcode: "EH1 1AA" });
    const b = sits({ postcode: "EH1 1AA" });
    const cand = scorePair(a, b, {
      kind: "institutional",
      institutionalFields: ["lastName", "dateOfBirth", "postcode"],
    });
    expect(cand.score).toBe(1);
    expect(cand.confidence).toBe("confident");
    expect(cand.reasons).toHaveLength(3);
  });

  it("rejects when one declared field differs (all-or-nothing)", () => {
    const a = banner({ postcode: "EH1 1AA" });
    const b = sits({ postcode: "EH9 9ZZ" });
    const cand = scorePair(a, b, {
      kind: "institutional",
      institutionalFields: ["lastName", "dateOfBirth", "postcode"],
    });
    expect(cand.score).toBeLessThan(1);
    expect(cand.confidence).not.toBe("confident");
  });
});

describe("reconcile", () => {
  it("returns descending score and skips self-matches", () => {
    const a = banner({ husid: "1234567890123" });
    const b = sits({ husid: "1234567890123" });
    const c = sits({
      sourceId: "S-2",
      firstName: "Bob",
      lastName: "Jones",
      dateOfBirth: "1985-05-05",
    });
    const results = reconcile([a], [b, c], { kind: "exact" });
    expect(results).toHaveLength(1);
    expect(results[0]?.b.sourceId).toBe("S-1");
  });

  it("skips identical (same system, same sourceId) pairs", () => {
    const dup: PersonRecord = banner();
    const results = reconcile([dup], [dup], { kind: "fuzzy" });
    expect(results).toHaveLength(0);
  });
});

describe("buildMergeLogEntry", () => {
  it("captures the candidate plus decision metadata", () => {
    const cand = scorePair(banner({ husid: "1234567890123" }), sits({ husid: "1234567890123" }), {
      kind: "exact",
    });
    const entry = buildMergeLogEntry({
      candidate: cand,
      keptCanonicalId: "K",
      mergedCanonicalId: "M",
      decidedBy: "system",
      decidedAt: "2026-05-26T13:00:00.000Z",
    });
    expect(entry.keptCanonicalId).toBe("K");
    expect(entry.mergedCanonicalId).toBe("M");
    expect(entry.candidate).toBe(cand);
    expect(entry.decidedAt).toBe("2026-05-26T13:00:00.000Z");
    expect(entry.decidedBy).toBe("system");
  });
});
