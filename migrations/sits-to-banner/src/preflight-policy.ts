/**
 * Pre-flight policy for the SITS → Banner migration. Same shape as the
 * Banner→SITS policy, but the required-codeset list inspects the reverse
 * direction.
 */
export interface PreFlightPolicy {
  denyOnSeverityAtLeast: "info" | "low" | "medium" | "high" | "critical";
  sampleSizeFloor: number;
  requiredCodesetCoverage: number;
  requiredCodesets: string[];
}

export const SITS_TO_BANNER_PREFLIGHT_POLICY: PreFlightPolicy = {
  denyOnSeverityAtLeast: "high",
  sampleSizeFloor: 100,
  requiredCodesetCoverage: 0.95,
  requiredCodesets: [
    "SITS.CAM→BANNER.STVCAMP",
    "SITS.STYP→BANNER.STVSTYP",
    "SITS.LEVL→BANNER.STVLEVL",
    "SITS.STU_GEND→BANNER.SPBPERS_SEX",
    "SITS.STU_ETHN→BANNER.GTVETCT",
    "FEESTATUS→BANNER.STVRESD",
  ],
};

export interface PreFlightDecision {
  passed: boolean;
  reasons: string[];
}

export interface PreFlightInput {
  worstSeverity?: "info" | "low" | "medium" | "high" | "critical";
  sampleSize: number;
  codesetCoverage: Record<string, number>;
}

const SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"] as const;

export function evaluatePreFlightPolicy(
  input: PreFlightInput,
  policy: PreFlightPolicy = SITS_TO_BANNER_PREFLIGHT_POLICY
): PreFlightDecision {
  const reasons: string[] = [];

  if (input.worstSeverity) {
    const observed = SEVERITY_ORDER.indexOf(input.worstSeverity);
    const threshold = SEVERITY_ORDER.indexOf(policy.denyOnSeverityAtLeast);
    if (observed >= threshold) {
      reasons.push(
        `denied: worst finding severity "${input.worstSeverity}" >= threshold "${policy.denyOnSeverityAtLeast}"`
      );
    }
  }

  if (input.sampleSize < policy.sampleSizeFloor) {
    reasons.push(`denied: sample size ${input.sampleSize} below floor ${policy.sampleSizeFloor}`);
  }

  for (const cs of policy.requiredCodesets) {
    const cov = input.codesetCoverage[cs];
    if (cov === undefined) {
      reasons.push(`denied: required codeset "${cs}" not measured`);
      continue;
    }
    if (cov < policy.requiredCodesetCoverage) {
      reasons.push(
        `denied: codeset "${cs}" coverage ${cov.toFixed(3)} below floor ${policy.requiredCodesetCoverage}`
      );
    }
  }

  return { passed: reasons.length === 0, reasons };
}
