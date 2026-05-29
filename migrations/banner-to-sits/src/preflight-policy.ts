/**
 * Pre-flight policy for the Banner → SITS migration.
 *
 * Encodes the demo-grade go/no-go gates the migration must satisfy
 * before a commit is permitted:
 *
 *  - any audit finding at severity ≥ "high" denies the run
 *  - sample-size floor of 100 — sub-100 samples are deemed
 *    statistically meaningless
 *  - required-codeset coverage ≥ 95% across the codeset translations
 *    inspected by the orchestrator
 */
export interface PreFlightPolicy {
  denyOnSeverityAtLeast: "info" | "low" | "medium" | "high" | "critical";
  sampleSizeFloor: number;
  requiredCodesetCoverage: number;
  /** Codesets that must be present and meet the coverage floor. */
  requiredCodesets: string[];
}

export const BANNER_TO_SITS_PREFLIGHT_POLICY: PreFlightPolicy = {
  denyOnSeverityAtLeast: "high",
  sampleSizeFloor: 100,
  requiredCodesetCoverage: 0.95,
  requiredCodesets: [
    "BANNER.STVCAMP→SITS.CAM",
    "BANNER.STVSTYP→SITS.STYP",
    "BANNER.STVLEVL→SITS.LEVL",
    "BANNER.STVRESD→FEESTATUS",
    "BANNER.SPBPERS_SEX→SITS.STU_GEND",
    "BANNER.GTVETCT→SITS.STU_ETHN",
  ],
};

export interface PreFlightDecision {
  passed: boolean;
  reasons: string[];
}

export interface PreFlightInput {
  /** Highest-severity finding observed during prep. */
  worstSeverity?: "info" | "low" | "medium" | "high" | "critical";
  /** Sample size used for coverage measurement. */
  sampleSize: number;
  /** Map of codeset name → observed coverage in [0, 1]. */
  codesetCoverage: Record<string, number>;
}

const SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"] as const;

export function evaluatePreFlightPolicy(
  input: PreFlightInput,
  policy: PreFlightPolicy = BANNER_TO_SITS_PREFLIGHT_POLICY
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
