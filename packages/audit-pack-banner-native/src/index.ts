/**
 * @databridge/audit-pack-banner-native
 *
 * Source-native Banner integrity audit pack.
 * Ten rules from BANNER_DATA_STRUCTURES.md §17, family BANNER-INTEGRITY.
 * These rules execute directly against the Banner Oracle schema and are
 * intended to run BEFORE source→canonical extraction so that integrity
 * issues are surfaced in the native shape (raw SGBSTDN / SPRIDEN /
 * SFRSTCR / SHRTCKG / TBRACCD / GORVISA / SARADAP / SHRDGMR).
 */
import type { AuditRule } from "@databridge/rule-core";
import { BANNER_NATIVE_RULES } from "./rules.js";

export { BANNER_NATIVE_RULES };

/** Pack metadata for registry/profile-summary endpoints. */
export const BANNER_NATIVE_AUDIT_PACK = {
  id: "banner-native",
  version: "0.1.0",
  label: "Banner native integrity",
  description:
    "Source-native integrity rules executing directly against raw Banner tables (SPRIDEN, SGBSTDN, SORLCUR, SFRSTCR, SSBSECT, SHRTCKG/SHRTCKN, SPBPERS, STVSTST, TBRACCD, GORVISA, SARADAP, SHRDGMR).",
  family: "BANNER-INTEGRITY" as const,
  rules: BANNER_NATIVE_RULES as ReadonlyArray<AuditRule>,
};

export type BannerNativeRuleId =
  | "BANNER-NAT-01"
  | "BANNER-NAT-02"
  | "BANNER-NAT-03"
  | "BANNER-NAT-04"
  | "BANNER-NAT-05"
  | "BANNER-NAT-06"
  | "BANNER-NAT-07"
  | "BANNER-NAT-08"
  | "BANNER-NAT-09"
  | "BANNER-NAT-10";
