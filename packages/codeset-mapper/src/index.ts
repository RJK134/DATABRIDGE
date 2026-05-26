/**
 * Phase I2 — Codeset mapping engine.
 *
 * Pluggable, versioned, tenant-configurable maps. The default registry is
 * pre-populated with the seed maps required by the gap analysis:
 *   - HECOS ↔ CIP2020 ↔ JACS3
 *   - Banner STVRESD → HESA FEESTATUS
 *   - Banner STVSTST → HESA RSNEND
 *   - Banner STVGRDE → numeric percentage
 *   - Banner ETHN_CODE → HESA ETHNIC
 *   - Banner NATN_CODE → ISO 3166-1 numeric
 */
export * from "./types.js";
export {
  CodesetMapRegistry,
  translateCode,
  computeCoverage,
} from "./mapper.js";
export {
  BUNDLED_MAP_FILES,
  loadBundledMap,
  loadAllBundledMaps,
  createDefaultRegistry,
} from "./seed-loader.js";
export type { BundledMapFile } from "./seed-loader.js";
