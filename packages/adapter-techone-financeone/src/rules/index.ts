/**
 * TechOne Finance One native audit pack.
 *
 * Mirrors the shape of @databridge/audit-pack-sits-native and
 * audit-pack-banner-native — exports an array of rules + a pack
 * metadata object.
 *
 * Co-located with the adapter so that the adapter and its rules ship
 * as one unit; future split-out into its own audit-pack-techone-native
 * package is mechanical.
 */
import type { AuditRule } from "@databridge/rule-core";
import { TECHONE_FIN1_NATIVE_RULES } from "./rules.js";

export { TECHONE_FIN1_NATIVE_RULES };

export const TECHONE_FIN1_NATIVE_AUDIT_PACK = {
  id: "techone-financeone-native",
  version: "0.1.0",
  label: "TechOne Finance One native integrity",
  description:
    "Source-native integrity rules executing directly against raw TechOne Finance One tables (T1_AR_CUSTOMER, T1_AR_TRANSACTION, T1_GL_TRANSACTION, T1_WF_INSTANCE, T1_AR_TRANSACTION_IMPORT_STAGING, T1_GL_EXCHANGE_RATE).",
  family: "TECHONE-FIN1-INTEGRITY" as const,
  rules: TECHONE_FIN1_NATIVE_RULES as ReadonlyArray<AuditRule>,
};

export type TechOneFin1RuleId =
  | "TECHONE-FIN1-01"
  | "TECHONE-FIN1-02"
  | "TECHONE-FIN1-03"
  | "TECHONE-FIN1-04"
  | "TECHONE-FIN1-05"
  | "TECHONE-FIN1-06"
  | "TECHONE-FIN1-07"
  | "TECHONE-FIN1-08"
  | "TECHONE-FIN1-09"
  | "TECHONE-FIN1-10"
  | "TECHONE-FIN1-11"
  | "TECHONE-FIN1-12"
  | "TECHONE-FIN1-13";
