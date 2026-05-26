/**
 * Codeset registry — loads the Phase H seed bundles (SITS / Banner /
 * HESA) on first access and exposes them through the API for the
 * mapping studio and the source-native audit packs' codelist
 * conformance checks.
 */
import type { CodeList } from "@databridge/adapter-spec";
import {
  loadAllCodesetSeeds,
  listCodesetSeeds,
  type SeedBundleSummary,
} from "@databridge/codeset-seeds";

let cache: Map<string, CodeList> | null = null;

function ensureLoaded(): Map<string, CodeList> {
  if (!cache) {
    cache = loadAllCodesetSeeds();
  }
  return cache;
}

export interface CodesetSummary {
  id: string;
  name: string;
  source: string;
  description?: string;
  entryCount: number;
}

function summarize(list: CodeList): CodesetSummary {
  const summary: CodesetSummary = {
    id: list.id,
    name: list.name,
    source: list.source,
    entryCount: list.entries.length,
  };
  if (list.description) summary.description = list.description;
  return summary;
}

export function listCodesetSummaries(): CodesetSummary[] {
  return Array.from(ensureLoaded().values()).map(summarize);
}

export function describeCodeset(id: string): CodeList | undefined {
  return ensureLoaded().get(id);
}

export function listCodesetBundles(): SeedBundleSummary[] {
  return listCodesetSeeds();
}

/** Test-only — clears the in-process cache. */
export function resetCodesetCache(): void {
  cache = null;
}
