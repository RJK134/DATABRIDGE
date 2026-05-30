import { describe, it, expect } from "vitest";
import { verifyCanonical, diffsToCsv, summariseDhp, type CanonicalRecord } from "../index.js";

const A: CanonicalRecord[] = [
  { entity: "student", id: "S1", fields: { surname: "Smith", firstName: "Alex", grade: 75 } },
  { entity: "student", id: "S2", fields: { surname: "Jones", firstName: "Beth", grade: 60 } },
  { entity: "student", id: "S3", fields: { surname: "Lee", firstName: "Sam", grade: 80 } },
];

const B: CanonicalRecord[] = [
  // S1 — exact match
  { entity: "student", id: "S1", fields: { surname: "Smith", firstName: "Alex", grade: 75 } },
  // S2 — mismatch on firstName
  { entity: "student", id: "S2", fields: { surname: "Jones", firstName: "Elizabeth", grade: 60 } },
  // S3 missing (only in A)
  // S4 — only in B
  { entity: "student", id: "S4", fields: { surname: "Patel", firstName: "Riya", grade: 90 } },
];

describe("verifyCanonical", () => {
  it("classifies matches, mismatches, and presence gaps", () => {
    const report = verifyCanonical(A, B);
    expect(report.entityScores.length).toBe(1);
    const s = report.entityScores[0]!;
    expect(s.entity).toBe("student");
    expect(s.recordsCompared).toBe(2); // S1 + S2 in both
    expect(s.missingInB).toBe(1); // S3
    expect(s.missingInA).toBe(1); // S4
    // S1: 3 matches. S2: surname match, grade match, firstName mismatch = 2 matches / 3
    expect(s.fieldComparisons).toBe(6);
    expect(s.fieldMatches).toBe(5);
    expect(s.dhp).toBeCloseTo(5 / 6, 5);
  });

  it("emits exactly one diff per non-match", () => {
    const report = verifyCanonical(A, B);
    const byStatus = report.diffs.reduce<Record<string, number>>((acc, d) => {
      acc[d.status] = (acc[d.status] ?? 0) + 1;
      return acc;
    }, {});
    expect(byStatus["mismatch"]).toBe(1);
    expect(byStatus["missing-in-a"]).toBe(1);
    expect(byStatus["missing-in-b"]).toBe(1);
  });

  it("treatBlanksAsEqual collapses null/undefined/empty", () => {
    const a: CanonicalRecord[] = [{ entity: "x", id: "1", fields: { foo: null, bar: "ok" } }];
    const b: CanonicalRecord[] = [{ entity: "x", id: "1", fields: { foo: "", bar: "ok" } }];
    const lax = verifyCanonical(a, b, { treatBlanksAsEqual: true });
    expect(lax.entityScores[0]!.dhp).toBe(1);
    const strict = verifyCanonical(a, b);
    expect(strict.entityScores[0]!.dhp).toBeLessThan(1);
  });

  it("uses fieldsByEntity override when supplied", () => {
    const report = verifyCanonical(A, B, {
      fieldsByEntity: { student: ["surname"] },
    });
    expect(report.entityScores[0]!.fieldComparisons).toBe(2);
    expect(report.entityScores[0]!.fieldMatches).toBe(2);
  });

  it("custom equals predicate", () => {
    const report = verifyCanonical(A, B, {
      equals: (a, b) =>
        typeof a === "string" && typeof b === "string"
          ? a.toLowerCase() === b.toLowerCase()
          : a === b,
    });
    expect(report).toBeDefined();
  });
});

describe("diffsToCsv + summariseDhp", () => {
  it("renders header + escaped values", () => {
    const csv = diffsToCsv([
      { entity: "x", id: "1", field: "f", status: "mismatch", a: "hi, world", b: "bye" },
    ]);
    expect(csv.split("\n")[0]).toBe("entity,id,field,status,a,b");
    expect(csv).toContain(`"hi, world"`);
  });

  it("summary string includes overall and per-entity percentages", () => {
    const report = verifyCanonical(A, B);
    const summary = summariseDhp(report);
    expect(summary).toContain("DHP overall=");
    expect(summary).toContain("student=");
  });
});
