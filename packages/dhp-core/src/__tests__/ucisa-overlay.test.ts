import { describe, it, expect } from 'vitest';
import { ucisaBenchmarkOverlay } from '../ucisa-overlay';
import { computeDhp } from '../compute';
import type { DhpComputeInput } from '../types';

const input: DhpComputeInput = {
  tenantId: 'test',
  profileId: 'hesa-tdp',
  records: { Student: new Array(50).fill({}) },
  ruleResults: [
    { ruleId: 'R1', entity: 'Student', family: 'FORMAT', severity: 'ERROR', failures: 1, totalEvaluated: 50 },
  ],
};

describe('ucisaBenchmarkOverlay', () => {
  it('returns results for all 6 dimensions plus OVERALL', () => {
    const metrics = computeDhp(input);
    const overlay = ucisaBenchmarkOverlay(metrics);
    expect(overlay.length).toBe(7);
    const dims = overlay.map((o) => o.dimension);
    expect(dims).toContain('OVERALL');
    expect(dims).toContain('COMPLETENESS');
    expect(dims).toContain('CONFORMANCE');
  });

  it('RAG status is RED when provider score is well below median', () => {
    const poorInput: DhpComputeInput = {
      ...input,
      ruleResults: [
        { ruleId: 'R1', entity: 'Student', family: 'FORMAT', severity: 'ERROR', failures: 40, totalEvaluated: 50 },
        { ruleId: 'R2', entity: 'Student', family: 'CODING', severity: 'ERROR', failures: 35, totalEvaluated: 50 },
        { ruleId: 'R3', entity: 'Student', family: 'COMPLETENESS', severity: 'ERROR', failures: 30, totalEvaluated: 50 },
      ],
    };
    const metrics = computeDhp(poorInput);
    const overlay = ucisaBenchmarkOverlay(metrics);
    const overall = overlay.find((o) => o.dimension === 'OVERALL')!;
    expect(overall.ragStatus).toBe('RED');
  });

  it('RAG status is GREEN when provider score is well above median', () => {
    const goodInput: DhpComputeInput = {
      ...input,
      ruleResults: [],
    };
    const metrics = computeDhp(goodInput);
    const overlay = ucisaBenchmarkOverlay(metrics);
    const overall = overlay.find((o) => o.dimension === 'OVERALL')!;
    expect(overall.ragStatus).toBe('GREEN');
  });
});
