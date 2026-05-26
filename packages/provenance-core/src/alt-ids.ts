import type { AltId, SourceSystem, AltIdType } from '@databridge/canonical';

/** Stable key for deduplication: system|type|value, all lower-cased. */
export function altIdKey(a: AltId): string {
  return `${a.system}|${a.type}|${a.value.toLowerCase()}`;
}

/**
 * Merge two AltId sets.
 *
 * Rules:
 *   - Dedupe by (system, type, value)
 *   - `firstSeenAt` — earliest wins (so we never forget when we first saw an id)
 *   - `current` — true beats false beats undefined (a confirmed-current
 *     observation outranks a stale one)
 *
 * The output order preserves `a`'s order then appends new entries from `b`.
 */
export function reconcileAltIds(a: AltId[] | undefined, b: AltId[] | undefined): AltId[] {
  const out: AltId[] = [];
  const index = new Map<string, number>();
  for (const id of a ?? []) {
    const k = altIdKey(id);
    index.set(k, out.length);
    out.push({ ...id });
  }
  for (const id of b ?? []) {
    const k = altIdKey(id);
    const existing = index.get(k);
    if (existing === undefined) {
      index.set(k, out.length);
      out.push({ ...id });
      continue;
    }
    const merged = mergeOne(out[existing]!, id);
    out[existing] = merged;
  }
  return out;
}

function mergeOne(prev: AltId, next: AltId): AltId {
  const firstSeenAt = pickEarliest(prev.firstSeenAt, next.firstSeenAt);
  const current = pickCurrent(prev.current, next.current);
  const merged: AltId = {
    system: prev.system,
    type: prev.type,
    value: prev.value,
  };
  if (firstSeenAt !== undefined) merged.firstSeenAt = firstSeenAt;
  if (current !== undefined) merged.current = current;
  return merged;
}

function pickEarliest(a?: string, b?: string): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a < b ? a : b;
}

function pickCurrent(a?: boolean, b?: boolean): boolean | undefined {
  if (a === true || b === true) return true;
  if (a === false || b === false) return false;
  return undefined;
}

/** Look up the first AltId matching a (system, type) selector. */
export function findAltId(
  ids: AltId[] | undefined,
  system: SourceSystem,
  type: AltIdType,
): AltId | undefined {
  return (ids ?? []).find((id) => id.system === system && id.type === type);
}

/** True if any AltId in the set matches the (system, type, value) triple. */
export function hasAltId(
  ids: AltId[] | undefined,
  system: SourceSystem,
  type: AltIdType,
  value: string,
): boolean {
  return (ids ?? []).some(
    (id) =>
      id.system === system &&
      id.type === type &&
      id.value.toLowerCase() === value.toLowerCase(),
  );
}
