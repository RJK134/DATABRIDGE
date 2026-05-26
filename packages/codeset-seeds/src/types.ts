/**
 * Codeset seed file shape — a versioned bundle of canonical CodeLists
 * derived from the reference documentation (SITS_DATA_STRUCTURES,
 * BANNER_DATA_STRUCTURES, HESA Coding Manual).
 */
import type { CodeList } from "@databridge/adapter-spec";

/** A single seed file. */
export interface CodesetSeedBundle {
  version: string;
  /** Logical seed source — `"sits"`, `"banner"`, `"hesa"`, etc. */
  source: string;
  description?: string;
  /**
   * Seed codeset entries — note these do NOT carry `snapshotAt` in the
   * file; the loader applies a synthetic snapshot timestamp.
   */
  codeLists: Array<Omit<CodeList, "snapshotAt">>;
}

/** Recognised seed bundle identifiers. */
export type SeedBundleId = "sits" | "banner" | "hesa";
