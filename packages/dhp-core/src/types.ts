import { z } from "zod";

export const DhpDimensionSchema = z.enum([
  "COMPLETENESS",
  "CONFORMANCE",
  "CONSISTENCY",
  "TIMELINESS",
  "UNIQUENESS",
  "REFERENTIAL_INTEGRITY",
]);
export type DhpDimension = z.infer<typeof DhpDimensionSchema>;

export interface DhpEntityMetrics {
  entity: string;
  totalRecords: number;
  dimensions: Record<
    DhpDimension,
    {
      score: number; // 0.0 – 1.0
      issueCount: number;
      ruleBreakdown: Array<{
        ruleId: string;
        failures: number;
        severity: "ERROR" | "WARNING" | "INFO";
      }>;
    }
  >;
  overallScore: number; // weighted average of dimensions
}

export interface DhpMetrics {
  tenantId: string;
  profileId: string;
  computedAt: Date;
  entities: DhpEntityMetrics[];
  overallScore: number; // weighted average across entities
  ucisaBenchmarks?: Record<string, number>; // benchmark scores keyed by metric id
}

export interface DhpSnapshot {
  id: string;
  tenantId: string;
  profileId: string;
  snapshotAt: Date;
  metrics: DhpMetrics;
  delta?: {
    previousSnapshotId: string;
    overallScoreDelta: number; // positive = improvement
    entityDeltas: Array<{
      entity: string;
      scoreDelta: number;
    }>;
  };
}

export interface DhpComputeInput {
  tenantId: string;
  profileId: string;
  /** Raw records keyed by entity name */
  records: Record<string, Record<string, unknown>[]>;
  /** Rule evaluation results from rule-core */
  ruleResults: Array<{
    ruleId: string;
    entity: string;
    field?: string;
    family: string;
    severity: "ERROR" | "WARNING" | "INFO";
    failures: number;
    totalEvaluated: number;
  }>;
}
