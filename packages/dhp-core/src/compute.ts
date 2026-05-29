import { DIMENSION_WEIGHTS, DHP_DIMENSIONS, FAMILY_TO_DIMENSION } from "./dimensions";
import type { DhpComputeInput, DhpEntityMetrics, DhpMetrics } from "./types";

export function computeDhp(input: DhpComputeInput): DhpMetrics {
  const entityNames = Object.keys(input.records);

  const entities: DhpEntityMetrics[] = entityNames.map((entity) => {
    const totalRecords = input.records[entity]?.length ?? 0;

    // Group rule results for this entity
    const entityResults = input.ruleResults.filter((r) => r.entity === entity);

    // Build dimension scores
    const dimensions = {} as DhpEntityMetrics["dimensions"];

    for (const dim of DHP_DIMENSIONS) {
      const dimResults = entityResults.filter(
        (r) => (FAMILY_TO_DIMENSION[r.family] ?? "CONFORMANCE") === dim
      );

      const totalEvaluated = dimResults.reduce((sum, r) => sum + r.totalEvaluated, 0);
      const totalFailures = dimResults.reduce((sum, r) => sum + r.failures, 0);

      const score =
        totalEvaluated > 0 ? Math.max(0, (totalEvaluated - totalFailures) / totalEvaluated) : 1.0;

      dimensions[dim] = {
        score: parseFloat(score.toFixed(4)),
        issueCount: totalFailures,
        ruleBreakdown: dimResults.map((r) => ({
          ruleId: r.ruleId,
          failures: r.failures,
          severity: r.severity,
        })),
      };
    }

    const overallScore = parseFloat(
      DHP_DIMENSIONS.reduce(
        (sum, dim) => sum + dimensions[dim].score * DIMENSION_WEIGHTS[dim],
        0
      ).toFixed(4)
    );

    return { entity, totalRecords, dimensions, overallScore };
  });

  const overallScore = parseFloat(
    (entities.reduce((sum, e) => sum + e.overallScore, 0) / Math.max(1, entities.length)).toFixed(4)
  );

  return {
    tenantId: input.tenantId,
    profileId: input.profileId,
    computedAt: new Date(),
    entities,
    overallScore,
  };
}
