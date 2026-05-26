/**
 * Codeset Mapper — types.
 *
 * A `CodesetMap` translates codes from a source codelist into codes from
 * a target codelist. Maps are:
 *
 *  - versioned (each map carries a semver-style string)
 *  - tenant-configurable (the loader can prefer a tenant override over a
 *    bundled default)
 *  - directional (A→B is independent of B→A; bidirectional maps must
 *    declare both directions explicitly)
 *  - traceable (every mapping carries optional notes used by the audit
 *    log when a translation is applied)
 */

/** A single mapping entry: one source code to one target code. */
export interface CodesetMapEntry {
  sourceCode: string;
  targetCode: string;
  /** Optional human-readable note (e.g. "approximation", "HESA convention"). */
  notes?: string;
  /** Optional active-from / active-to dates the mapping applies to. */
  activeFrom?: string;
  activeTo?: string;
}

/** A versioned, directional map between two codelists. */
export interface CodesetMap {
  id: string;
  /** Logical name (human-readable). */
  name: string;
  /** Source codelist id (e.g. "STVRESD"). */
  sourceCodelist: string;
  /** Target codelist id (e.g. "FEESTATUS"). */
  targetCodelist: string;
  version: string;
  description?: string;
  /** Tenant id this map belongs to; absent = bundled default. */
  tenantId?: string;
  entries: CodesetMapEntry[];
}

/** Result of attempting to translate a single code. */
export interface CodesetMapResult {
  mapId: string;
  sourceCodelist: string;
  targetCodelist: string;
  sourceCode: string;
  targetCode?: string;
  /** Free-form explanation when no target was produced. */
  unmappedReason?: string;
  /** True if the mapping succeeded. */
  ok: boolean;
  /** Notes propagated from the matching entry. */
  notes?: string;
}

/** Coverage statistics for a map vs an observed code distribution. */
export interface CodesetMapCoverage {
  mapId: string;
  sourceCodelist: string;
  targetCodelist: string;
  /** Number of distinct source codes observed in the input. */
  observed: number;
  /** Number of distinct source codes that successfully mapped. */
  mapped: number;
  /** Codes seen in input but missing from the map. */
  unmappedCodes: string[];
  /** Coverage ratio in [0, 1]. */
  coverage: number;
}
