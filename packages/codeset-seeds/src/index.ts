/**
 * @databridge/codeset-seeds
 *
 * Ground-truth codeset seed bundles for SITS, Banner, and HESA. Drives
 * the Phase I codeset-mapping engine and lets the source-native audit
 * packs run codelist-conformance with no hand-curation.
 *
 * Seed JSON files live in `seeds/*.json` and are loaded via
 * `loadCodesetSeed(id)`.
 */
export * from "./types.js";
export {
  loadCodesetSeed,
  loadCodesetSeedAsync,
  loadAllCodesetSeeds,
  listCodesetSeeds,
  SEED_BUNDLE_IDS,
} from "./loader.js";
export type { SeedBundleSummary } from "./loader.js";
