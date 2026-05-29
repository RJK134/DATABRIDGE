import { describe, it, expect } from "vitest";
import { verifyCanonical, type CanonicalRecord } from "@databridge/parallel-run-verifier";
import { SitsToBannerOrchestrator } from "../orchestrator.js";

function buildFixture(n: number): {
  a: CanonicalRecord[];
  b: CanonicalRecord[];
} {
  const a: CanonicalRecord[] = [];
  const b: CanonicalRecord[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = `B${String(i).padStart(4, "0")}`;
    const fields = {
      studentId: id,
      programmeCode: "CS",
      termCode: "2024/25",
      campusCode: "M",
      feeStatus: "01",
    };
    a.push({ entity: "Student", id, fields });
    b.push({ entity: "Student", id, fields: { ...fields } });
  }
  return { a, b };
}

describe("SitsToBanner parallel-run verifier (500-row fixture)", () => {
  it("reports zero drift for an identical projection on both sides", () => {
    const { a, b } = buildFixture(500);
    const report = verifyCanonical(a, b);
    expect(report.diffs).toHaveLength(0);
    expect(report.overallDhp).toBe(1);
  });

  it("detects a missing record on the B side", () => {
    const { a, b } = buildFixture(500);
    b.pop();
    const report = verifyCanonical(a, b);
    expect(report.diffs.length).toBeGreaterThan(0);
    expect(report.diffs[0]?.status).toBe("missing-in-b");
  });

  it("SUPPORTED_ENTITIES list is non-empty", () => {
    expect(SitsToBannerOrchestrator.SUPPORTED_ENTITIES.length).toBeGreaterThan(0);
  });
});
