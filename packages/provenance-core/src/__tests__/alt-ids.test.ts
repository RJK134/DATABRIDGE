import { describe, it, expect } from 'vitest';
import type { AltId } from '@databridge/canonical';
import { reconcileAltIds, altIdKey, findAltId, hasAltId } from '../alt-ids.js';

describe('reconcileAltIds', () => {
  it('returns empty array when both inputs are empty', () => {
    expect(reconcileAltIds(undefined, undefined)).toEqual([]);
    expect(reconcileAltIds([], [])).toEqual([]);
  });

  it('preserves order of the first set', () => {
    const a: AltId[] = [
      { system: 'banner-oracle', type: 'pidm', value: '82045' },
      { system: 'sits-oracle', type: 'mst-code', value: '23123456' },
    ];
    const merged = reconcileAltIds(a, undefined);
    expect(merged.map((m) => m.value)).toEqual(['82045', '23123456']);
  });

  it('dedupes by (system, type, value) case-insensitively', () => {
    const a: AltId[] = [{ system: 'banner-oracle', type: 'banner-id', value: 'Z00123456' }];
    const b: AltId[] = [{ system: 'banner-oracle', type: 'banner-id', value: 'z00123456' }];
    const merged = reconcileAltIds(a, b);
    expect(merged).toHaveLength(1);
  });

  it('keeps the earliest firstSeenAt', () => {
    const a: AltId[] = [
      { system: 'banner-oracle', type: 'pidm', value: '82045', firstSeenAt: '2024-06-01T00:00:00Z' },
    ];
    const b: AltId[] = [
      { system: 'banner-oracle', type: 'pidm', value: '82045', firstSeenAt: '2023-01-01T00:00:00Z' },
    ];
    const merged = reconcileAltIds(a, b);
    expect(merged[0]!.firstSeenAt).toBe('2023-01-01T00:00:00Z');
  });

  it('treats current=true as winning over current=false or undefined', () => {
    const a: AltId[] = [{ system: 'sits-oracle', type: 'mst-code', value: '23', current: false }];
    const b: AltId[] = [{ system: 'sits-oracle', type: 'mst-code', value: '23', current: true }];
    expect(reconcileAltIds(a, b)[0]!.current).toBe(true);
    expect(reconcileAltIds(b, a)[0]!.current).toBe(true);
  });

  it('merges new entries from b after entries from a', () => {
    const a: AltId[] = [{ system: 'banner-oracle', type: 'pidm', value: '82045' }];
    const b: AltId[] = [{ system: 'sits-oracle', type: 'mst-code', value: '23123456' }];
    const merged = reconcileAltIds(a, b);
    expect(merged).toHaveLength(2);
    expect(merged[1]!.system).toBe('sits-oracle');
  });
});

describe('altIdKey', () => {
  it('lower-cases the value but not the system/type', () => {
    const id: AltId = { system: 'banner-oracle', type: 'banner-id', value: 'Z00123' };
    expect(altIdKey(id)).toBe('banner-oracle|banner-id|z00123');
  });
});

describe('findAltId / hasAltId', () => {
  const ids: AltId[] = [
    { system: 'banner-oracle', type: 'pidm', value: '82045' },
    { system: 'sits-oracle', type: 'mst-code', value: '23123456' },
  ];

  it('finds by system + type', () => {
    expect(findAltId(ids, 'banner-oracle', 'pidm')?.value).toBe('82045');
  });

  it('returns undefined when no match', () => {
    expect(findAltId(ids, 'workday-raas', 'pidm')).toBeUndefined();
  });

  it('hasAltId matches case-insensitively on value', () => {
    expect(hasAltId(ids, 'sits-oracle', 'mst-code', '23123456')).toBe(true);
    expect(hasAltId(ids, 'sits-oracle', 'mst-code', '23123456'.toUpperCase())).toBe(true);
  });
});
