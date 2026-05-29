import { describe, it, expect } from "vitest";
import { verifyCanonical, type CanonicalRecord } from "@databridge/parallel-run-verifier";
import { BannerToSitsOrchestrator } from "../orchestrator.js";

/**
 * 500-row parallel-run integration test. The fixture seeds *identical*
 * canonical projections from a Banner-derived source and a SITS-derived
 * source, then runs the verifier and asserts zero drift.
 */
function buildFixture(n: number): {
  a: CanonicalRecord[];
  b: CanonicalRecord[];
} {
  const a: CanonicalRecord[] = [];
  const b: CanonicalRecord[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = `S${String(i).padStart(4, "0")}`;
    const fields = {
      studentId: id,
      programmeCode: "CS",
      termCode: "202410",
      campusCode: "MAIN",
      feeStatus: "H",
    };
    a.push({ entity: "Student", id, fields });
    b.push({ entity: "Student", id, fields: { ...fields } });
  }
  return { a, b };
}

describe("BannerToSits parallel-run verifier (500-row fixture)", () => {
  it("reports zero drift for an identical projection on both sides", () => {
    const { a, b } = buildFixture(500);
    const report = verifyCanonical(a, b);
    expect(report.diffs).toHaveLength(0);
    expect(report.overallDhp).toBe(1);
    expect(report.entityScores[0]?.recordsCompared).toBe(500);
  });

  it("detects a single field mismatch when one side drifts", () => {
    const { a, b } = buildFixture(500);
    // Drift one record's campus code on the B side.
    const lastB = b.at(-1)!;
    lastB.fields = { ...lastB.fields, campusCode: "NORTH" };
    const report = verifyCanonical(a, b);
    expect(report.diffs.length).toBeGreaterThan(0);
    expect(report.diffs[0]?.field).toBe("campusCode");
  });

  it("supports SUPPORTED_ENTITIES enumeration", () => {
    expect(BannerToSitsOrchestrator.SUPPORTED_ENTITIES.length).toBeGreaterThan(0);
  });
});
