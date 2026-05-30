import { describe, it, expect } from "vitest";
import { computeDhp } from "../compute";
import type { DhpComputeInput } from "../types";

const baseInput: DhpComputeInput = {
  tenantId: "tenant-test",
  profileId: "hesa-tdp",
  records: {
    Student: new Array(100).fill({ HUSID: "0123456789012", ETHNIC: "10" }),
    Engagement: new Array(80).fill({ ENGID: "E001", HUSID: "0123456789012" }),
  },
  ruleResults: [
    {
      ruleId: "HESA-TDP-001",
      entity: "Student",
      family: "FORMAT",
      severity: "ERROR",
      failures: 5,
      totalEvaluated: 100,
    },
    {
      ruleId: "HESA-TDP-010",
      entity: "Student",
      family: "CODING",
      severity: "ERROR",
      failures: 2,
      totalEvaluated: 100,
    },
    {
      ruleId: "HESA-TDP-030",
      entity: "Engagement",
      family: "REFERENTIAL",
      severity: "ERROR",
      failures: 0,
      totalEvaluated: 80,
    },
  ],
};

describe("computeDhp", () => {
  it("returns metrics with correct tenantId and profileId", () => {
    const result = computeDhp(baseInput);
    expect(result.tenantId).toBe("tenant-test");
    expect(result.profileId).toBe("hesa-tdp");
  });

  it("computes entity metrics for all input entities", () => {
    const result = computeDhp(baseInput);
    const entityNames = result.entities.map((e) => e.entity);
    expect(entityNames).toContain("Student");
    expect(entityNames).toContain("Engagement");
  });

  it("Student CONFORMANCE score reflects 7 failures from 200 evaluated", () => {
    const result = computeDhp(baseInput);
    const student = result.entities.find((e) => e.entity === "Student")!;
    const conformance = student.dimensions.CONFORMANCE;
    // 7 failures / 200 evaluated = 0.965
    expect(conformance.score).toBeCloseTo(0.965, 2);
    expect(conformance.issueCount).toBe(7);
  });

  it("Engagement REFERENTIAL_INTEGRITY score is 1.0 with zero failures", () => {
    const result = computeDhp(baseInput);
    const eng = result.entities.find((e) => e.entity === "Engagement")!;
    expect(eng.dimensions.REFERENTIAL_INTEGRITY.score).toBe(1.0);
  });

  it("overall score is between 0 and 1", () => {
    const result = computeDhp(baseInput);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
  });

  it("returns 1.0 for dimensions with no rule results", () => {
    const result = computeDhp(baseInput);
    const student = result.entities.find((e) => e.entity === "Student")!;
    expect(student.dimensions.TIMELINESS.score).toBe(1.0);
    expect(student.dimensions.UNIQUENESS.score).toBe(1.0);
  });
});
