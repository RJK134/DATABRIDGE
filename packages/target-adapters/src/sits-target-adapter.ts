/**
 * SitsTargetAdapter — TargetAdapter for SITS (oracle/api).
 *
 * Implements per-entity required-field declarations matching the SITS
 * data dictionary; commits are routed through the injected
 * `TargetTransport` (typically Oracle thick-client or the SITS REST
 * "Tribal API" surface).
 *
 * Dry-run is the default — the higher-level migration runner must
 * explicitly pass `dryRun: false` to actually write.
 */
import type { TargetAdapterCapabilities } from "@databridge/adapter-spec";
import { BaseTargetAdapter } from "./base-target-adapter.js";

/** Required fields per SITS entity. Sourced from SITS_DATA_STRUCTURES.md. */
const SITS_REQUIRED_FIELDS: Record<string, readonly string[]> = {
  stu: ["stu_code", "stu_surn", "stu_fnm1"],
  sce: ["sce_stuc", "sce_crsc", "sce_ayrc", "sce_seq2"],
  scj: ["scj_stuc", "scj_crsc", "scj_code"],
  mab: ["mab_modc", "mab_mksc", "mab_seq1"],
  mav: ["mav_modc", "mav_ayrc"],
  mod: ["mod_code", "mod_name"],
  crs: ["crs_code", "crs_name"],
  ass: ["ass_stuc", "ass_modc", "ass_mark"],
};

export class SitsTargetAdapter extends BaseTargetAdapter {
  readonly id = "sits-target";
  readonly displayName = "SITS (Tribal) — write target";
  readonly capabilities: TargetAdapterCapabilities = {
    supportsRollback: true,
    supportsUpsert: true,
    supportsPartialUpdate: true,
    batchSizeLimit: 1000,
  };

  protected requiredFields(entity: string): readonly string[] {
    return SITS_REQUIRED_FIELDS[entity] ?? [];
  }
}
