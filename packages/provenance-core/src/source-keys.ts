import type { SourceKeys } from '@databridge/canonical';

/**
 * Merge two SourceKeys maps. Later values for the same (system, key) win,
 * but neither map is mutated.
 */
export function mergeSourceKeys(
  a: SourceKeys | undefined,
  b: SourceKeys | undefined,
): SourceKeys {
  const out: SourceKeys = {};
  for (const [sys, keys] of Object.entries(a ?? {})) {
    out[sys] = { ...keys };
  }
  for (const [sys, keys] of Object.entries(b ?? {})) {
    const existing = out[sys] ?? {};
    out[sys] = { ...existing, ...keys };
  }
  return out;
}

/** Read a specific native key. Returns undefined if absent. */
export function getNativeKey(
  sourceKeys: SourceKeys | undefined,
  system: string,
  keyName: string,
): string | undefined {
  return sourceKeys?.[system]?.[keyName];
}

/** Write a single native key into a SourceKeys map, returning a new map. */
export function setNativeKey(
  sourceKeys: SourceKeys | undefined,
  system: string,
  keyName: string,
  value: string,
): SourceKeys {
  const existing = sourceKeys?.[system] ?? {};
  return {
    ...(sourceKeys ?? {}),
    [system]: { ...existing, [keyName]: value },
  };
}

/**
 * Verify a round-trip: given a sourceKeys map and an expected set of
 * (system, key, value) triples, return any that are missing or differ.
 * Used by the parallel-run verification harness in Phase J.
 */
export interface SourceKeyMismatch {
  system: string;
  key: string;
  expected: string;
  actual: string | undefined;
}

export function verifySourceKeys(
  sourceKeys: SourceKeys | undefined,
  expected: Array<{ system: string; key: string; value: string }>,
): SourceKeyMismatch[] {
  const mismatches: SourceKeyMismatch[] = [];
  for (const e of expected) {
    const actual = getNativeKey(sourceKeys, e.system, e.key);
    if (actual !== e.value) {
      const m: SourceKeyMismatch = { system: e.system, key: e.key, expected: e.value, actual };
      mismatches.push(m);
    }
  }
  return mismatches;
}
