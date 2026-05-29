import { describe, it, expect } from "vitest";
import { SITS_TO_BANNER_PREFLIGHT_POLICY, evaluatePreFlightPolicy } from "../preflight-policy.js";

const fullCoverage = (): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const cs of SITS_TO_BANNER_PREFLIGHT_POLICY.requiredCodesets) m[cs] = 1.0;
  return m;
};

describe("evaluatePreFlightPolicy (sits→banner)", () => {
  it("passes when all gates are met", () => {
    const d = evaluatePreFlightPolicy({
      worstSeverity: "low",
      sampleSize: 500,
      codesetCoverage: fullCoverage(),
    });
    expect(d.passed).toBe(true);
  });

  it("denies when sample size below floor", () => {
    const d = evaluatePreFlightPolicy({
      sampleSize: 30,
      codesetCoverage: fullCoverage(),
    });
    expect(d.passed).toBe(false);
  });

  it("denies on missing codeset", () => {
    const cov = fullCoverage();
    delete cov["SITS.CAM→BANNER.STVCAMP"];
    const d = evaluatePreFlightPolicy({
      sampleSize: 500,
      codesetCoverage: cov,
    });
    expect(d.passed).toBe(false);
  });

  it("denies on critical severity", () => {
    const d = evaluatePreFlightPolicy({
      worstSeverity: "critical",
      sampleSize: 500,
      codesetCoverage: fullCoverage(),
    });
    expect(d.passed).toBe(false);
  });
});
