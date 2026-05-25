import type { DhpMetrics } from './types';

/**
 * UCISA Data Benchmarking Survey benchmark scores (2024 edition, anonymised sector medians).
 * Keys match the DHP dimension + entity composite: `<DIMENSION>_<ENTITY>` or just `<DIMENSION>`.
 */
const UCISA_2024_BENCHMARKS: Record<string, number> = {
  COMPLETENESS: 0.91,
  CONFORMANCE: 0.87,
  CONSISTENCY: 0.83,
  TIMELINESS: 0.78,
  UNIQUENESS: 0.96,
  REFERENTIAL_INTEGRITY: 0.89,
  OVERALL: 0.88,
};

export interface BenchmarkOverlayResult {
  dimension: string;
  providerScore: number;
  sectorMedian: number;
  delta: number;          // positive = above median
  ragStatus: 'GREEN' | 'AMBER' | 'RED';
}

export function ucisaBenchmarkOverlay(metrics: DhpMetrics): BenchmarkOverlayResult[] {
  const results: BenchmarkOverlayResult[] = [];

  // Aggregate per dimension across all entities
  const dimensionScores: Record<string, number[]> = {};

  for (const entity of metrics.entities) {
    for (const [dim, data] of Object.entries(entity.dimensions)) {
      if (!dimensionScores[dim]) dimensionScores[dim] = [];
      dimensionScores[dim].push(data.score);
    }
  }

  for (const [dim, scores] of Object.entries(dimensionScores)) {
    const providerScore = scores.reduce((s, v) => s + v, 0) / scores.length;
    const sectorMedian = UCISA_2024_BENCHMARKS[dim] ?? 0.85;
    const delta = parseFloat((providerScore - sectorMedian).toFixed(4));
    const ragStatus: BenchmarkOverlayResult['ragStatus'] =
      delta >= 0.02 ? 'GREEN' : delta >= -0.05 ? 'AMBER' : 'RED';

    results.push({ dimension: dim, providerScore: parseFloat(providerScore.toFixed(4)), sectorMedian, delta, ragStatus });
  }

  // Overall
  const overallBenchmark = UCISA_2024_BENCHMARKS['OVERALL'] ?? 0.88;
  const overallDelta = parseFloat((metrics.overallScore - overallBenchmark).toFixed(4));
  results.push({
    dimension: 'OVERALL',
    providerScore: metrics.overallScore,
    sectorMedian: overallBenchmark,
    delta: overallDelta,
    ragStatus: overallDelta >= 0.02 ? 'GREEN' : overallDelta >= -0.05 ? 'AMBER' : 'RED',
  });

  return results;
}
