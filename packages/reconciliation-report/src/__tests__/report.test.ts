import { describe, expect, it } from "vitest";
import type { PersonRecord } from "@databridge/identity-reconciler";
import { buildReconciliationReport, summariseReport } from "../index.js";

const ban = (id: string, overrides: Partial<PersonRecord> = {}): PersonRecord => ({
  system: "banner",
  sourceId: id,
  firstName: "F",
  lastName: "L",
  dateOfBirth: "2000-01-01",
  ...overrides,
});
const sit = (id: string, overrides: Partial<PersonRecord> = {}): PersonRecord => ({
  system: "sits",
  sourceId: id,
  firstName: "F",
  lastName: "L",
  dateOfBirth: "2000-01-01",
  ...overrides,
});

describe("buildReconciliationReport — exact policy", () => {
  it("matches on shared husid, separates lonely records, exposes counts", () => {
    const a1 = ban("B-1", { husid: "1234567890123", firstName: "Alice", lastName: "Smith" });
    const a2 = ban("B-2", { husid: "9999999999999", firstName: "Bob",   lastName: "Jones" });
    const b1 = sit("S-1", { husid: "1234567890123", firstName: "Alice", lastName: "Smith" });
    const b2 = sit("S-2", { husid: "8888888888888", firstName: "Carla", lastName: "Doe" });

    const report = buildReconciliationReport({
      systemA: "banner",
      systemB: "sits",
      sourceA: [a1, a2],
      sourceB: [b1, b2],
      policy: { kind: "exact" },
    });

    expect(report.counts.matched).toBe(1);
    expect(report.counts.sourceAOnly).toBe(1);
    expect(report.counts.sourceBOnly).toBe(1);
    expect(report.counts.totalA).toBe(2);
    expect(report.counts.totalB).toBe(2);
    expect(report.matched[0]?.a.sourceId).toBe("B-1");
    expect(report.matched[0]?.b.sourceId).toBe("S-1");
    expect(report.sourceAOnly[0]?.sourceId).toBe("B-2");
    expect(report.sourceBOnly[0]?.sourceId).toBe("S-2");
  });

  it("flags conflicts on matched-but-disagreeing fields", () => {
    const a = ban("B-1", { husid: "1234567890123", firstName: "Alice", lastName: "Smith" });
    const b = sit("S-1", { husid: "1234567890123", firstName: "Alicia", lastName: "Smith" });

    const report = buildReconciliationReport({
      systemA: "banner",
      systemB: "sits",
      sourceA: [a],
      sourceB: [b],
      policy: { kind: "exact" },
    });

    expect(report.counts.matched).toBe(1);
    expect(report.counts.conflicting).toBe(1);
    const conflict = report.matched[0]?.conflicts[0];
    expect(conflict?.field).toBe("firstName");
    expect(conflict?.valueA).toBe("Alice");
    expect(conflict?.valueB).toBe("Alicia");
  });

  it("each A record claims at most one B record (greedy by score)", () => {
    // Two B records share the same husid — the highest-scoring claim wins
    // and the other B record falls into source-B-only.
    const a = ban("B-1", { husid: "1234567890123" });
    const b1 = sit("S-1", { husid: "1234567890123", firstName: "Match", lastName: "Both" });
    const b2 = sit("S-2", { husid: "1234567890123", firstName: "X", lastName: "Y" });
    const report = buildReconciliationReport({
      systemA: "banner",
      systemB: "sits",
      sourceA: [a],
      sourceB: [b1, b2],
      policy: { kind: "exact" },
    });
    expect(report.counts.matched).toBe(1);
    expect(report.counts.sourceBOnly).toBe(1);
  });
});

describe("summariseReport", () => {
  it("emits a one-liner with matched / only / conflicting counts", () => {
    const report = buildReconciliationReport({
      systemA: "banner",
      systemB: "sits",
      sourceA: [],
      sourceB: [],
      policy: { kind: "exact" },
    });
    const line = summariseReport(report);
    expect(line).toContain("0 matched");
    expect(line).toContain("0 banner-only");
    expect(line).toContain("0 sits-only");
  });
});
