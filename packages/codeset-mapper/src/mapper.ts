/**
 * Codeset Mapper — runtime mapping engine.
 *
 * `CodesetMapRegistry` owns a collection of `CodesetMap` instances keyed
 * by `(sourceCodelist, targetCodelist, tenantId?)`. The translate API
 * resolves a tenant-specific override before falling back to the bundled
 * default.
 */
import type { CodesetMap, CodesetMapCoverage, CodesetMapResult } from "./types.js";

/** Compose the registry lookup key. */
function key(source: string, target: string, tenantId?: string): string {
  return `${tenantId ?? "*"}::${source}->${target}`;
}

/** In-memory registry of CodesetMap instances. */
export class CodesetMapRegistry {
  private byKey = new Map<string, CodesetMap>();
  private byId = new Map<string, CodesetMap>();

  register(map: CodesetMap): void {
    this.byKey.set(key(map.sourceCodelist, map.targetCodelist, map.tenantId), map);
    this.byId.set(map.id, map);
  }

  /** Bulk-register many maps. */
  registerAll(maps: readonly CodesetMap[]): void {
    for (const m of maps) this.register(m);
  }

  /** Look up a map by id. */
  get(id: string): CodesetMap | undefined {
    return this.byId.get(id);
  }

  /**
   * Resolve the best map for a (source, target) pair: prefer a
   * tenant-specific map if one is registered, else fall back to the
   * bundled default (tenantId undefined).
   */
  resolve(
    sourceCodelist: string,
    targetCodelist: string,
    tenantId?: string
  ): CodesetMap | undefined {
    if (tenantId) {
      const tenantMap = this.byKey.get(key(sourceCodelist, targetCodelist, tenantId));
      if (tenantMap) return tenantMap;
    }
    return this.byKey.get(key(sourceCodelist, targetCodelist));
  }

  /** List every map currently registered. */
  list(): CodesetMap[] {
    // dedupe — byKey may have stored multiple variants for tenant overrides
    return Array.from(this.byId.values());
  }
}

/** Translate one code through the resolved map. */
export function translateCode(
  registry: CodesetMapRegistry,
  args: {
    sourceCodelist: string;
    targetCodelist: string;
    sourceCode: string;
    tenantId?: string;
    /** Optional observation date; mapping entries with from/to outside this date are skipped. */
    at?: string;
  }
): CodesetMapResult {
  const map = registry.resolve(args.sourceCodelist, args.targetCodelist, args.tenantId);
  if (!map) {
    return {
      mapId: "",
      sourceCodelist: args.sourceCodelist,
      targetCodelist: args.targetCodelist,
      sourceCode: args.sourceCode,
      ok: false,
      unmappedReason: "no map registered for this source→target pair",
    };
  }
  const at = args.at;
  const entry = map.entries.find((e) => {
    if (e.sourceCode !== args.sourceCode) return false;
    if (at) {
      if (e.activeFrom && at < e.activeFrom) return false;
      if (e.activeTo && at > e.activeTo) return false;
    }
    return true;
  });
  if (!entry) {
    return {
      mapId: map.id,
      sourceCodelist: args.sourceCodelist,
      targetCodelist: args.targetCodelist,
      sourceCode: args.sourceCode,
      ok: false,
      unmappedReason: `source code "${args.sourceCode}" not present in map ${map.id}`,
    };
  }
  const result: CodesetMapResult = {
    mapId: map.id,
    sourceCodelist: args.sourceCodelist,
    targetCodelist: args.targetCodelist,
    sourceCode: args.sourceCode,
    targetCode: entry.targetCode,
    ok: true,
  };
  if (entry.notes !== undefined) result.notes = entry.notes;
  return result;
}

/**
 * Compute coverage of a map against a list of observed source codes.
 * Useful as an audit dimension — low coverage flags incomplete tenant maps.
 */
export function computeCoverage(
  map: CodesetMap,
  observedCodes: readonly string[]
): CodesetMapCoverage {
  const distinct = Array.from(new Set(observedCodes));
  const mappable = new Set(map.entries.map((e) => e.sourceCode));
  const unmappedCodes = distinct.filter((c) => !mappable.has(c));
  const mapped = distinct.length - unmappedCodes.length;
  const coverage = distinct.length === 0 ? 1 : mapped / distinct.length;
  return {
    mapId: map.id,
    sourceCodelist: map.sourceCodelist,
    targetCodelist: map.targetCodelist,
    observed: distinct.length,
    mapped,
    unmappedCodes,
    coverage,
  };
}
