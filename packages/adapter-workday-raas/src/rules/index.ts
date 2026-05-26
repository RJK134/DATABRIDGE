/**
 * Workday Student native audit pack.
 *
 * Mirrors @databridge/audit-pack-sits-native / audit-pack-banner-native.
 * Co-located with the adapter for the same reason as the TechOne pack —
 * adapter and rules ship as one unit. Future extraction into
 * audit-pack-workday-native is mechanical.
 */
import type { AuditRule } from "@databridge/rule-core";
import { WORKDAY_NATIVE_RULES } from "./rules.js";

export { WORKDAY_NATIVE_RULES };

export const WORKDAY_NATIVE_AUDIT_PACK = {
  id: "workday-native",
  version: "0.1.0",
  label: "Workday Student native integrity",
  description:
    "Source-native integrity rules executing directly against Workday Student entities via RaaS reports (Persons, Students, Program_of_Study_in_Progress, Course_Section_Registrations, Tuition_Charges, Cash_Receipts, Business_Process_Instances).",
  family: "WORKDAY-INTEGRITY" as const,
  rules: WORKDAY_NATIVE_RULES as ReadonlyArray<AuditRule>,
};

export type WorkdayNativeRuleId =
  | "WORKDAY-NAT-01"
  | "WORKDAY-NAT-02"
  | "WORKDAY-NAT-03"
  | "WORKDAY-NAT-04"
  | "WORKDAY-NAT-05"
  | "WORKDAY-NAT-06"
  | "WORKDAY-NAT-07"
  | "WORKDAY-NAT-08"
  | "WORKDAY-NAT-09"
  | "WORKDAY-NAT-10"
  | "WORKDAY-NAT-11"
  | "WORKDAY-NAT-12"
  | "WORKDAY-NAT-13"
  | "WORKDAY-NAT-14"
  | "WORKDAY-NAT-15"
  | "WORKDAY-NAT-16";
