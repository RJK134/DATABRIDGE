/**
 * @databridge/audit-pack-sits-native
 *
 * Source-native SITS:Vision integrity audit pack.
 * Ten rules from SITS_DATA_STRUCTURES.md §19, family SITS-INTEGRITY.
 * These rules execute directly against the SITS Oracle schema and are
 * intended to run BEFORE source→canonical extraction so that integrity
 * issues are surfaced in the native shape (raw STU/SCJ/SCE/SMR/etc.).
 */
import type { AuditRule } from "@databridge/rule-core";
import { SITS_NATIVE_RULES } from "./rules.js";

export { SITS_NATIVE_RULES };

/** Pack metadata for registry/profile-summary endpoints. */
export const SITS_NATIVE_AUDIT_PACK = {
  id: "sits-native",
  version: "0.1.0",
  label: "SITS native integrity",
  description:
    "Source-native integrity rules executing directly against raw SITS:Vision tables (STU, MST, SCJ, SCE, SMR, SAT, MAB, SAW, VCR, men_udf).",
  family: "SITS-INTEGRITY" as const,
  rules: SITS_NATIVE_RULES as ReadonlyArray<AuditRule>,
};

export type SitsNativeRuleId =
  | "SITS-NAT-01"
  | "SITS-NAT-02"
  | "SITS-NAT-03"
  | "SITS-NAT-04"
  | "SITS-NAT-05"
  | "SITS-NAT-06"
  | "SITS-NAT-07"
  | "SITS-NAT-08"
  | "SITS-NAT-09"
  | "SITS-NAT-10";
