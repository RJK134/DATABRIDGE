/**
 * Bundled-default seed loader for the codeset-mapper.
 *
 * Reads the JSON map files shipped under `<pkg>/maps/` and registers them
 * with a `CodesetMapRegistry`. Tenant overrides live elsewhere and are
 * registered on top.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CodesetMap } from "./types.js";
import { CodesetMapRegistry } from "./mapper.js";

/** Bundled map identifiers — keep in sync with `<pkg>/maps/*.json`. */
export const BUNDLED_MAP_FILES = [
  "stvresd-to-feestatus.json",
  "stvstst-to-rsnend.json",
  "stvgrde-to-numeric.json",
  "ethn-code-to-hesa-ethnic.json",
  "natn-code-to-iso3166.json",
  "hecos-to-cip.json",
  "hecos-to-jacs.json",
  "cip-to-hecos.json",
] as const;

export type BundledMapFile = (typeof BUNDLED_MAP_FILES)[number];

/** Resolve <pkg>/maps/<file>. */
function resolveMapPath(file: string, baseDir?: string): string {
  if (baseDir) return path.join(baseDir, file);
  const here = path.dirname(fileURLToPath(import.meta.url));
  // After `tsc`, this module lives in `dist/`; maps live at `<pkg>/maps/`.
  return path.resolve(here, "..", "maps", file);
}

/** Read and parse one bundled map. */
export function loadBundledMap(file: BundledMapFile, baseDir?: string): CodesetMap {
  const fp = resolveMapPath(file, baseDir);
  const raw = readFileSync(fp, "utf8");
  return JSON.parse(raw) as CodesetMap;
}

/** Load every bundled map and return them as an array. */
export function loadAllBundledMaps(baseDir?: string): CodesetMap[] {
  return BUNDLED_MAP_FILES.map((f) => loadBundledMap(f, baseDir));
}

/** Convenience — build a registry pre-populated with bundled defaults. */
export function createDefaultRegistry(baseDir?: string): CodesetMapRegistry {
  const reg = new CodesetMapRegistry();
  reg.registerAll(loadAllBundledMaps(baseDir));
  return reg;
}
