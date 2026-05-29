/**
 * Codeset seed loader.
 *
 * Reads bundle JSON files from `seeds/` (sibling to `src/`) and returns
 * canonical `CodeList[]` populated with a synthetic snapshot timestamp.
 *
 * Seeds are kept as plain JSON (not imported as TS modules) so the
 * package can ship them as data files and so the `tsc --rootDir src`
 * boundary is preserved.
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CodeList } from "@databridge/adapter-spec";
import type { CodesetSeedBundle, SeedBundleId } from "./types.js";

/** Resolve the on-disk path of `seeds/<id>.json` relative to this module. */
function resolveSeedPath(id: SeedBundleId, baseDir?: string): string {
  if (baseDir) return path.join(baseDir, `${id}.json`);
  const here = path.dirname(fileURLToPath(import.meta.url));
  // After `tsc` runs, this file lives at `dist/loader.js`. Seeds live at
  // `<pkg>/seeds/*.json`. Both `src/` and `dist/` resolve to the package
  // root via `..`.
  return path.resolve(here, "..", "seeds", `${id}.json`);
}

/** Synchronous read + parse — used by the static loader. */
function readBundleSync(id: SeedBundleId, baseDir?: string): CodesetSeedBundle {
  const file = resolveSeedPath(id, baseDir);
  const raw = readFileSync(file, "utf8");
  return JSON.parse(raw) as CodesetSeedBundle;
}

/** Stamp a snapshotAt on every CodeList in the bundle. */
function stamp(bundle: CodesetSeedBundle, snapshotAt: string): CodeList[] {
  return bundle.codeLists.map((c) => ({ ...c, snapshotAt }));
}

/**
 * Load a seed bundle by id.
 *
 * Synchronous filesystem read; the bundle JSON is small (~7 KB) so the
 * cost is negligible relative to import-time JSON parsing.
 */
export function loadCodesetSeed(
  id: SeedBundleId,
  options: { snapshotAt?: string; baseDir?: string } = {}
): CodeList[] {
  const bundle = readBundleSync(id, options.baseDir);
  const snapshotAt = options.snapshotAt ?? new Date().toISOString();
  return stamp(bundle, snapshotAt);
}

/** Load every known seed bundle into a Map keyed by CodeList.id. */
export function loadAllCodesetSeeds(
  options: { snapshotAt?: string; baseDir?: string } = {}
): Map<string, CodeList> {
  const out = new Map<string, CodeList>();
  for (const id of SEED_BUNDLE_IDS) {
    for (const list of loadCodesetSeed(id, options)) {
      out.set(list.id, list);
    }
  }
  return out;
}

/** Asynchronous variant — handy in tests + future remote loaders. */
export async function loadCodesetSeedAsync(
  id: SeedBundleId,
  options: { snapshotAt?: string; baseDir?: string } = {}
): Promise<CodeList[]> {
  const file = resolveSeedPath(id, options.baseDir);
  const raw = await readFile(file, "utf8");
  const bundle = JSON.parse(raw) as CodesetSeedBundle;
  const snapshotAt = options.snapshotAt ?? new Date().toISOString();
  return stamp(bundle, snapshotAt);
}

/** Stable list of bundles shipped by this package. */
export const SEED_BUNDLE_IDS: ReadonlyArray<SeedBundleId> = ["sits", "banner", "hesa"];

/** Inventory metadata (id, source, description) without expanding entries. */
export interface SeedBundleSummary {
  id: SeedBundleId;
  version: string;
  source: string;
  description?: string;
  codeListCount: number;
  totalEntries: number;
}

export function listCodesetSeeds(baseDir?: string): SeedBundleSummary[] {
  return SEED_BUNDLE_IDS.map((id) => {
    const b = readBundleSync(id, baseDir);
    const summary: SeedBundleSummary = {
      id,
      version: b.version,
      source: b.source,
      codeListCount: b.codeLists.length,
      totalEntries: b.codeLists.reduce((acc, l) => acc + l.entries.length, 0),
    };
    if (b.description) summary.description = b.description;
    return summary;
  });
}
