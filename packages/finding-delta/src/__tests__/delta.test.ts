import { describe, expect, it } from "vitest";
import type { AuditFinding } from "@databridge/rule-core";
import {
  computeFindingDelta,
  defaultIssueKey,
  diffPayload,
  filterDelta,
  summariseDeltaMd,
} from "../index.js";

const ISO = "2026-05-26T18:00:00.000Z";

function f(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: "t-1",
    ruleId: "rule-x",
    ruleName: "Rule X",
    severity: "ERROR",
    entityType: "Student",
    subjectId: "s-1",
    message: "broken",
    evidence: { a: 1 },
    status: "open",
    detectedAt: ISO,
    ...overrides,
  };
}

describe("defaultIssueKey", () => {
  it("derives a stable key from rule/entity/subject", () => {
    expect(defaultIssueKey(f())).toBe("rule-x::Student::s-1::");
  });
  it("includes nativeKeys sorted", () => {
    expect(defaultIssueKey(f({ nativeKeys: { spr_code: "A1", spr_seq: 2 } }))).toBe(
      "rule-x::Student::s-1::spr_code=A1|spr_seq=2"
    );
  });
});

describe("diffPayload", () => {
  it("returns empty when payloads match", () => {
    expect(diffPayload(f(), f())).toEqual([]);
  });
  it("flags severity bump", () => {
    const reasons = diffPayload(f({ severity: "WARN" }), f({ severity: "ERROR" }));
    expect(reasons.some((r) => r.includes("severity"))).toBe(true);
  });
  it("flags evidence drift", () => {
    const reasons = diffPayload(f({ evidence: { a: 1 } }), f({ evidence: { a: 2 } }));
    expect(reasons).toContain("evidence changed");
  });
  it("flags rule predicate drift", () => {
    const reasons = diffPayload(
      f({ ruleProvenance: { kind: "sql", predicate: "x > 1" } }),
      f({ ruleProvenance: { kind: "sql", predicate: "x > 2" } })
    );
    expect(reasons).toContain("rule predicate changed");
  });
});

describe("computeFindingDelta", () => {
  it("classifies new findings", () => {
    const delta = computeFindingDelta([], [f({ subjectId: "s-new" })]);
    expect(delta.summary.newCount).toBe(1);
    expect(delta.summary.bySeverity.ERROR.new).toBe(1);
  });

  it("classifies resolved findings", () => {
    const delta = computeFindingDelta([f({ subjectId: "s-gone" })], []);
    expect(delta.summary.resolvedCount).toBe(1);
    expect(delta.summary.bySeverity.ERROR.resolved).toBe(1);
  });

  it("classifies persistent findings", () => {
    const same = f({ subjectId: "s-keep" });
    const delta = computeFindingDelta([same], [{ ...same }]);
    expect(delta.summary.persistentCount).toBe(1);
    expect(delta.summary.newCount).toBe(0);
  });

  it("classifies changed findings", () => {
    const before = f({ subjectId: "s-x", severity: "WARN" });
    const after = f({ subjectId: "s-x", severity: "ERROR" });
    const delta = computeFindingDelta([before], [after]);
    expect(delta.summary.changedCount).toBe(1);
    const entry = delta.entries[0]!;
    expect(entry.kind).toBe("changed");
    expect(entry.changeReasons?.some((r) => r.includes("severity"))).toBe(true);
  });

  it("handles mixed sets", () => {
    const prev = [
      f({ subjectId: "s-keep" }),
      f({ subjectId: "s-gone" }),
      f({ subjectId: "s-mod", severity: "WARN" }),
    ];
    const curr = [
      f({ subjectId: "s-keep" }),
      f({ subjectId: "s-new" }),
      f({ subjectId: "s-mod", severity: "ERROR" }),
    ];
    const delta = computeFindingDelta(prev, curr);
    expect(delta.summary).toMatchObject({
      newCount: 1,
      resolvedCount: 1,
      persistentCount: 1,
      changedCount: 1,
    });
  });

  it("respects custom keyFn", () => {
    const a = f({ subjectId: "s-1" });
    const b = f({ subjectId: "s-2" });
    // Custom keyFn collapses by ruleId only
    const delta = computeFindingDelta([a], [b], { keyFn: (x) => x.ruleId });
    expect(delta.summary.persistentCount).toBe(1);
    expect(delta.summary.newCount).toBe(0);
  });

  it("computedAt uses provided clock", () => {
    const delta = computeFindingDelta([], [], { clock: () => "FIXED" });
    expect(delta.computedAt).toBe("FIXED");
  });
});

describe("filterDelta + summariseDeltaMd", () => {
  it("filters by kind", () => {
    const delta = computeFindingDelta([f({ subjectId: "g" })], [f({ subjectId: "n" })]);
    expect(filterDelta(delta, "new")).toHaveLength(1);
    expect(filterDelta(delta, "resolved")).toHaveLength(1);
    expect(filterDelta(delta, "persistent")).toHaveLength(0);
  });

  it("emits markdown with all severities listed", () => {
    const delta = computeFindingDelta([], [f({ severity: "CRITICAL" })]);
    const md = summariseDeltaMd(delta);
    expect(md).toContain("CRITICAL");
    expect(md).toContain("INFO");
    expect(md).toContain("| new | 1 |");
  });
});
