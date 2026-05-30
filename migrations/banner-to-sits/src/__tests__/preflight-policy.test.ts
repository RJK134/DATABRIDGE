import { describe, it, expect } from "vitest";
import { BANNER_TO_SITS_PREFLIGHT_POLICY, evaluatePreFlightPolicy } from "../preflight-policy.js";

const fullCoverage = (): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const cs of BANNER_TO_SITS_PREFLIGHT_POLICY.requiredCodesets) m[cs] = 1.0;
  return m;
};

describe("evaluatePreFlightPolicy (banner→sits)", () => {
  it("passes when all gates are met", () => {
    const decision = evaluatePreFlightPolicy({
      worstSeverity: "low",
      sampleSize: 500,
      codesetCoverage: fullCoverage(),
    });
    expect(decision.passed).toBe(true);
    expect(decision.reasons).toEqual([]);
  });

  it("denies when worst severity is high or worse", () => {
    const decision = evaluatePreFlightPolicy({
      worstSeverity: "high",
      sampleSize: 500,
      codesetCoverage: fullCoverage(),
    });
    expect(decision.passed).toBe(false);
    expect(decision.reasons.some((r) => r.includes("severity"))).toBe(true);
  });

  it("denies when sample size is below the floor (100)", () => {
    const decision = evaluatePreFlightPolicy({
      sampleSize: 50,
      codesetCoverage: fullCoverage(),
    });
    expect(decision.passed).toBe(false);
    expect(decision.reasons.some((r) => r.includes("sample size"))).toBe(true);
  });

  it("denies when codeset coverage dips below 95%", () => {
    const cov = fullCoverage();
    cov["BANNER.STVCAMP→SITS.CAM"] = 0.8;
    const decision = evaluatePreFlightPolicy({
      sampleSize: 500,
      codesetCoverage: cov,
    });
    expect(decision.passed).toBe(false);
    expect(decision.reasons.some((r) => r.includes("STVCAMP"))).toBe(true);
  });

  it("denies when a required codeset is missing entirely", () => {
    const cov = fullCoverage();
    delete cov["BANNER.STVCAMP→SITS.CAM"];
    const decision = evaluatePreFlightPolicy({
      sampleSize: 500,
      codesetCoverage: cov,
    });
    expect(decision.passed).toBe(false);
    expect(decision.reasons.some((r) => r.includes("not measured"))).toBe(true);
  });
});
