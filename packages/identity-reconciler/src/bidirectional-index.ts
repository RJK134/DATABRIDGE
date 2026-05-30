/**
 * Bidirectional identity index.
 *
 * The forward reconciler (`reconcile(...)`) scores incoming-vs-existing
 * candidates and is the right tool for live matching. For Banner↔SITS
 * migration runs we additionally need a stable many-to-many lookup that
 * can answer:
 *
 *   - given a Banner PIDM, what SITS STU_CODE(s) does it correspond to?
 *   - given a SITS STU_CODE, what Banner PIDM(s)?
 *   - given either, what canonical PersonId does the merge log map them to?
 *
 * The index is pure — it materialises the cross-references from a list of
 * person records and never mutates them. The forward `reconcile` /
 * `scorePair` API is unaffected.
 */
import type { PersonRecord, SourceSystemTag } from "./types.js";

export interface BidirectionalIndexEntry {
  canonicalId: string;
  banner?: string;
  sits?: string;
  /** Auxiliary source-system ids (workday, ucas, …) on the same person. */
  others: Record<string, string[]>;
}

export interface BidirectionalIndex {
  /** canonicalId → entry (when canonicalId is known). */
  readonly byCanonical: ReadonlyMap<string, BidirectionalIndexEntry>;
  /** Banner PIDM → entry. */
  readonly byBanner: ReadonlyMap<string, BidirectionalIndexEntry>;
  /** SITS STU_CODE → entry. */
  readonly bySits: ReadonlyMap<string, BidirectionalIndexEntry>;
  /** Records that have no canonical id assigned and no Banner/SITS pair. */
  readonly orphans: readonly PersonRecord[];
}

/** Build a bidirectional Banner↔SITS↔canonical index. */
export function buildBidirectionalIndex(records: readonly PersonRecord[]): BidirectionalIndex {
  const byCanonical = new Map<string, BidirectionalIndexEntry>();
  const byBanner = new Map<string, BidirectionalIndexEntry>();
  const bySits = new Map<string, BidirectionalIndexEntry>();
  const orphans: PersonRecord[] = [];

  // Step 1: group by canonicalId where present; otherwise emit a fresh
  // synthetic canonical anchor per (banner OR sits) source id pair.
  let syntheticCounter = 1;
  for (const r of records) {
    const cid = r.canonicalId ?? syntheticCanonical(r, syntheticCounter++);
    let entry = byCanonical.get(cid);
    if (!entry) {
      entry = { canonicalId: cid, others: {} };
      byCanonical.set(cid, entry);
    }
    attachToEntry(entry, r);
  }

  // Step 2: build per-system indexes.
  for (const entry of byCanonical.values()) {
    if (entry.banner) byBanner.set(entry.banner, entry);
    if (entry.sits) bySits.set(entry.sits, entry);
    if (!entry.banner && !entry.sits) {
      // Pure orphan — surfaced for ops review.
    }
  }

  // Step 3: orphans = records that didn't make it into either side.
  for (const r of records) {
    const idx = perSystemMap(r.system, byBanner, bySits);
    if (idx === undefined) continue;
    if (!idx.has(r.sourceId)) orphans.push(r);
  }

  return { byCanonical, byBanner, bySits, orphans };
}

function syntheticCanonical(r: PersonRecord, n: number): string {
  return `synthetic:${r.system}:${r.sourceId}:${n}`;
}

function attachToEntry(entry: BidirectionalIndexEntry, r: PersonRecord): void {
  if (r.system === "banner") {
    entry.banner = r.sourceId;
  } else if (r.system === "sits") {
    entry.sits = r.sourceId;
  } else {
    const list = entry.others[r.system] ?? [];
    if (!list.includes(r.sourceId)) list.push(r.sourceId);
    entry.others[r.system] = list;
  }
}

function perSystemMap(
  system: SourceSystemTag,
  byBanner: ReadonlyMap<string, BidirectionalIndexEntry>,
  bySits: ReadonlyMap<string, BidirectionalIndexEntry>
): ReadonlyMap<string, BidirectionalIndexEntry> | undefined {
  if (system === "banner") return byBanner;
  if (system === "sits") return bySits;
  return undefined;
}

/** Convenience: resolve canonicalId from a Banner PIDM. */
export function resolveCanonicalFromBanner(
  index: BidirectionalIndex,
  pidm: string
): string | undefined {
  return index.byBanner.get(pidm)?.canonicalId;
}

/** Convenience: resolve canonicalId from a SITS STU_CODE. */
export function resolveCanonicalFromSits(
  index: BidirectionalIndex,
  stuCode: string
): string | undefined {
  return index.bySits.get(stuCode)?.canonicalId;
}

/** Convenience: lookup the SITS counterpart of a Banner PIDM (forward). */
export function bannerToSits(index: BidirectionalIndex, pidm: string): string | undefined {
  return index.byBanner.get(pidm)?.sits;
}

/** Convenience: lookup the Banner counterpart of a SITS STU_CODE (reverse). */
export function sitsToBanner(index: BidirectionalIndex, stuCode: string): string | undefined {
  return index.bySits.get(stuCode)?.banner;
}
