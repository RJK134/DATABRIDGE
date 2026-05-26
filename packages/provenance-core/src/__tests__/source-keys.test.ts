import { describe, it, expect } from 'vitest';
import {
  mergeSourceKeys,
  getNativeKey,
  setNativeKey,
  verifySourceKeys,
} from '../source-keys.js';

describe('mergeSourceKeys', () => {
  it('combines disjoint systems', () => {
    const a = { banner: { pidm: '82045' } };
    const b = { sits: { stuCode: '23123456' } };
    const out = mergeSourceKeys(a, b);
    expect(out['banner']?.['pidm']).toBe('82045');
    expect(out['sits']?.['stuCode']).toBe('23123456');
  });

  it('later (b) wins on key conflict within a system', () => {
    const a = { banner: { pidm: '82045' } };
    const b = { banner: { pidm: '99999' } };
    expect(mergeSourceKeys(a, b)['banner']?.['pidm']).toBe('99999');
  });

  it('does not mutate inputs', () => {
    const a = { banner: { pidm: '82045' } };
    const b = { banner: { pidm: '99999' } };
    mergeSourceKeys(a, b);
    expect(a['banner']?.['pidm']).toBe('82045');
    expect(b['banner']?.['pidm']).toBe('99999');
  });

  it('handles undefined on either side', () => {
    expect(mergeSourceKeys(undefined, undefined)).toEqual({});
    expect(mergeSourceKeys({ a: { x: '1' } }, undefined)).toEqual({ a: { x: '1' } });
    expect(mergeSourceKeys(undefined, { a: { x: '1' } })).toEqual({ a: { x: '1' } });
  });
});

describe('getNativeKey / setNativeKey', () => {
  it('round-trips a single key', () => {
    const out = setNativeKey(undefined, 'banner', 'pidm', '82045');
    expect(getNativeKey(out, 'banner', 'pidm')).toBe('82045');
  });

  it('setNativeKey preserves other systems', () => {
    const initial = setNativeKey(undefined, 'banner', 'pidm', '82045');
    const updated = setNativeKey(initial, 'sits', 'stuCode', '23123456');
    expect(getNativeKey(updated, 'banner', 'pidm')).toBe('82045');
    expect(getNativeKey(updated, 'sits', 'stuCode')).toBe('23123456');
  });

  it('getNativeKey returns undefined on missing system', () => {
    expect(getNativeKey({ banner: { pidm: '82045' } }, 'sits', 'stuCode')).toBeUndefined();
  });
});

describe('verifySourceKeys', () => {
  const keys = { banner: { pidm: '82045', crn: '10243' } };

  it('returns empty when all expected match', () => {
    const m = verifySourceKeys(keys, [
      { system: 'banner', key: 'pidm', value: '82045' },
      { system: 'banner', key: 'crn', value: '10243' },
    ]);
    expect(m).toEqual([]);
  });

  it('flags differing value', () => {
    const m = verifySourceKeys(keys, [{ system: 'banner', key: 'pidm', value: '99999' }]);
    expect(m).toHaveLength(1);
    expect(m[0]!.actual).toBe('82045');
    expect(m[0]!.expected).toBe('99999');
  });

  it('flags missing key', () => {
    const m = verifySourceKeys(keys, [{ system: 'sits', key: 'stuCode', value: 'X' }]);
    expect(m[0]!.actual).toBeUndefined();
  });
});
