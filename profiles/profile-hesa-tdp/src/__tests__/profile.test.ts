import { describe, it, expect } from 'vitest';
import { HESA_TDP_PROFILE } from '../profile';
import { HESA_TDP_RULES } from '../rules';
import { ETHNIC, MODE, RSNEND, QUALENT3, SEXID } from '../codings';

describe('HESA_TDP_PROFILE', () => {
  it('has a valid id and version', () => {
    expect(HESA_TDP_PROFILE.id).toBe('hesa-tdp');
    expect(HESA_TDP_PROFILE.version).toMatch(/^\d{4}/);
  });

  it('exports at least 8 entities', () => {
    expect(HESA_TDP_PROFILE.entities.length).toBeGreaterThanOrEqual(8);
  });

  it('exports at least 25 fields', () => {
    expect(HESA_TDP_PROFILE.fields.length).toBeGreaterThanOrEqual(25);
  });

  it('exports at least 10 rules', () => {
    expect(HESA_TDP_RULES.length).toBeGreaterThanOrEqual(10);
  });
});

describe('HESA-TDP-001 HUSID format rule', () => {
  const rule = HESA_TDP_RULES.find((r) => r.id === 'HESA-TDP-001')!;

  it('passes a valid 13-digit HUSID', () => {
    expect(rule.evaluate({ value: '0123456789012' })).toMatchObject({ pass: true });
  });

  it('fails a 12-digit HUSID', () => {
    expect(rule.evaluate({ value: '012345678901' })).toMatchObject({ pass: false });
  });

  it('fails a non-numeric HUSID', () => {
    expect(rule.evaluate({ value: 'ABCDEFGHIJKLM' })).toMatchObject({ pass: false });
  });
});

describe('Coding frame conformance rules', () => {
  const ethnicRule = HESA_TDP_RULES.find((r) => r.id === 'HESA-TDP-010')!;
  const modeRule = HESA_TDP_RULES.find((r) => r.id === 'HESA-TDP-012')!;

  it('ETHNIC: passes a valid code', () => {
    const valid = ETHNIC.values[0]!.code;
    expect(ethnicRule.evaluate({ value: valid })).toMatchObject({ pass: true });
  });

  it('ETHNIC: fails an invalid code', () => {
    expect(ethnicRule.evaluate({ value: '99' })).toMatchObject({ pass: false });
  });

  it('MODE: passes code 1 (full-time)', () => {
    expect(modeRule.evaluate({ value: '1' })).toMatchObject({ pass: true });
  });

  it('MODE: fails code 99', () => {
    expect(modeRule.evaluate({ value: '99' })).toMatchObject({ pass: false });
  });
});

describe('HESA-TDP-020 temporal consistency', () => {
  const rule = HESA_TDP_RULES.find((r) => r.id === 'HESA-TDP-020')!;

  it('passes when ENDDATE is after COMDATE', () => {
    expect(
      rule.evaluate({ record: { COMDATE: '2023-09-01', ENDDATE: '2026-06-30' } }),
    ).toMatchObject({ pass: true });
  });

  it('fails when ENDDATE is before COMDATE', () => {
    expect(
      rule.evaluate({ record: { COMDATE: '2023-09-01', ENDDATE: '2022-06-30' } }),
    ).toMatchObject({ pass: false });
  });

  it('passes when ENDDATE is absent', () => {
    expect(rule.evaluate({ record: { COMDATE: '2023-09-01' } })).toMatchObject({ pass: true });
  });
});

describe('HESA-TDP-040 STULOAD/MODE consistency', () => {
  const rule = HESA_TDP_RULES.find((r) => r.id === 'HESA-TDP-040')!;

  it('warns when full-time student has STULOAD 0.3', () => {
    expect(rule.evaluate({ record: { MODE: '1', STULOAD: 0.3 } })).toMatchObject({ pass: false });
  });

  it('passes when full-time student has STULOAD 1.0', () => {
    expect(rule.evaluate({ record: { MODE: '1', STULOAD: 1.0 } })).toMatchObject({ pass: true });
  });

  it('passes for part-time student with any STULOAD', () => {
    expect(rule.evaluate({ record: { MODE: '2', STULOAD: 0.2 } })).toMatchObject({ pass: true });
  });
});
