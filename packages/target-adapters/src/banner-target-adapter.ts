/**
 * BannerTargetAdapter — TargetAdapter for Banner (oracle/ethos).
 *
 * Required-field declarations match the Banner data dictionary
 * (BANNER_DATA_STRUCTURES.md). Writes are routed through the injected
 * `TargetTransport` — production transports speak Ellucian Ethos REST
 * (or thick Oracle for legacy installs); the in-memory transport is
 * used for tests and the verification harness.
 *
 * Dry-run by default; rollback is supported (Ethos surrogate-id reversal
 * + Oracle DELETE).
 */
import type { TargetAdapterCapabilities } from "@databridge/adapter-spec";
import { BaseTargetAdapter } from "./base-target-adapter.js";

/** Required fields per Banner entity. */
const BANNER_REQUIRED_FIELDS: Record<string, readonly string[]> = {
  spriden: ["spriden_pidm", "spriden_id", "spriden_last_name", "spriden_first_name"],
  sgbstdn: ["sgbstdn_pidm", "sgbstdn_term_code_eff", "sgbstdn_styp_code"],
  shrtgpa: ["shrtgpa_pidm", "shrtgpa_term_code", "shrtgpa_gpa"],
  shrtckg: ["shrtckg_pidm", "shrtckg_term_code", "shrtckg_grde_code_final"],
  shrtckn: ["shrtckn_pidm", "shrtckn_term_code", "shrtckn_subj_code", "shrtckn_crse_numb"],
  sfrstcr: ["sfrstcr_pidm", "sfrstcr_term_code", "sfrstcr_crn"],
  ssbsect: ["ssbsect_term_code", "ssbsect_crn", "ssbsect_subj_code", "ssbsect_crse_numb"],
  sorlcur: ["sorlcur_pidm", "sorlcur_term_code", "sorlcur_lmod_code"],
  sirasgn: ["sirasgn_term_code", "sirasgn_crn", "sirasgn_pidm"],
  smraprp: ["smraprp_program", "smraprp_term_code_eff"],
};

export class BannerTargetAdapter extends BaseTargetAdapter {
  readonly id = "banner-target";
  readonly displayName = "Banner (Ellucian Ethos / Oracle) — write target";
  readonly capabilities: TargetAdapterCapabilities = {
    supportsRollback: true,
    supportsUpsert: true,
    supportsPartialUpdate: true,
    batchSizeLimit: 500,
  };

  protected requiredFields(entity: string): readonly string[] {
    return BANNER_REQUIRED_FIELDS[entity] ?? [];
  }
}
