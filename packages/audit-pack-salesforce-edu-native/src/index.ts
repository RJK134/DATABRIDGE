/**
 * @databridge/audit-pack-salesforce-edu-native
 *
 * Eight source-native rules that execute against the raw Salesforce
 * Education Cloud shape (Contact, Account, hed__Program_Plan__c,
 * hed__Affiliation__c, hed__Course_Enrollment__c, hed__Course__c). Each
 * rule is a FnAuditRule evaluated by the rule engine against batches
 * extracted via @databridge/adapter-salesforce-edu.
 *
 * Family: SALESFORCE-EDU-NATIVE.
 */
import type { AuditRule, FnAuditRule, FnRuleResult } from "@databridge/rule-core";

const FAMILY = "SALESFORCE-EDU-NATIVE" as const;

function rec(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && "record" in (input as Record<string, unknown>)) {
    const r = (input as { record?: unknown }).record;
    if (r && typeof r === "object") return r as Record<string, unknown>;
  }
  return (input as Record<string, unknown>) ?? {};
}

function pass(): FnRuleResult {
  return { pass: true };
}

function fail(message: string, detail?: Record<string, unknown>): FnRuleResult {
  return detail ? { pass: false, message, detail } : { pass: false, message };
}

/** Rule 01 — Duplicate Contact by email. */
const DUPLICATE_EMAIL: FnAuditRule = {
  id: "SALESFORCE-EDU-01",
  family: FAMILY,
  name: "Duplicate Contact by email",
  description:
    "Two or more Contact records sharing an Email address. Salesforce does not enforce email uniqueness; downstream Marketing Cloud / single sign-on flows break on duplicates.",
  severity: "ERROR",
  entity: "Contact",
  field: "Email",
  enabledByDefault: true,
  tags: ["duplicate", "identity"],
  evaluate(input, context?: { seenEmails?: Set<string> }) {
    const r = rec(input);
    const email = typeof r["Email"] === "string" ? (r["Email"] as string).trim().toLowerCase() : "";
    if (!email) return pass();
    const seen = context?.seenEmails;
    if (!seen) return pass();
    if (seen.has(email)) {
      return fail(`Contact with duplicate email "${email}"`, { contactId: r["Id"] });
    }
    seen.add(email);
    return pass();
  },
};

/** Rule 02 — Orphan Affiliation (no parent Account). */
const ORPHAN_AFFILIATION: FnAuditRule = {
  id: "SALESFORCE-EDU-02",
  family: FAMILY,
  name: "Orphan Affiliation (no parent Account)",
  description:
    "hed__Affiliation__c rows must reference a non-null hed__Account__c. Orphan affiliations indicate a Marketing Cloud or import error.",
  severity: "ERROR",
  entity: "Affiliation",
  field: "hed__Account__c",
  enabledByDefault: true,
  evaluate(input) {
    const r = rec(input);
    if (!r["hed__Account__c"]) {
      return fail(`Affiliation ${String(r["Id"] ?? "<unknown>")} has no parent Account`);
    }
    return pass();
  },
};

/** Rule 03 — Programme Plan without enrolments. */
const PROGRAMME_PLAN_NO_ENROLLMENTS: FnAuditRule = {
  id: "SALESFORCE-EDU-03",
  family: FAMILY,
  name: "Programme Plan without enrolments",
  description:
    "Active hed__Program_Plan__c rows that have no hed__Course_Enrollment__c children. Often indicates a stalled student journey or aborted recruitment.",
  severity: "WARN",
  entity: "ProgramPlan",
  enabledByDefault: true,
  evaluate(input, context?: { enrollmentsByProgrammePlan?: Set<string> }) {
    const r = rec(input);
    const status = typeof r["hed__Status__c"] === "string" ? r["hed__Status__c"] : "";
    if (status !== "Current") return pass();
    const id = String(r["Id"] ?? "");
    if (context?.enrollmentsByProgrammePlan && !context.enrollmentsByProgrammePlan.has(id)) {
      return fail(`Programme Plan ${id} marked Current but has no Course Enrollments`);
    }
    return pass();
  },
};

/** Rule 04 — Contact without Affiliation. */
const CONTACT_WITHOUT_AFFILIATION: FnAuditRule = {
  id: "SALESFORCE-EDU-04",
  family: FAMILY,
  name: "Contact without any Affiliation",
  description:
    "Every Contact representing a student should have at least one Affiliation row that ties them to an institutional Account. Missing affiliations mean the contact is invisible to programme-level analytics.",
  severity: "WARN",
  entity: "Contact",
  enabledByDefault: true,
  evaluate(input, context?: { affiliationContactIds?: Set<string> }) {
    const r = rec(input);
    const id = String(r["Id"] ?? "");
    if (!id) return pass();
    if (context?.affiliationContactIds && !context.affiliationContactIds.has(id)) {
      return fail(`Contact ${id} has no Affiliation rows`);
    }
    return pass();
  },
};

/** Rule 05 — Course Enrollment with missing Course. */
const ENROLLMENT_WITHOUT_COURSE: FnAuditRule = {
  id: "SALESFORCE-EDU-05",
  family: FAMILY,
  name: "Course Enrollment without Course Offering",
  description:
    "hed__Course_Enrollment__c must reference a hed__Course_Offering__c. Orphan enrolments break transcript projection.",
  severity: "ERROR",
  entity: "CourseEnrollment",
  field: "hed__Course_Offering__c",
  enabledByDefault: true,
  evaluate(input) {
    const r = rec(input);
    if (!r["hed__Course_Offering__c"]) {
      return fail(`Enrollment ${String(r["Id"] ?? "<unknown>")} has no Course Offering`);
    }
    return pass();
  },
};

/** Rule 06 — Mismatched FERPA / consent flags. */
const FERPA_MISMATCH: FnAuditRule = {
  id: "SALESFORCE-EDU-06",
  family: FAMILY,
  name: "Contact FERPA / consent flag mismatch",
  description:
    "A Contact whose hed__FERPA__c flag conflicts with marketing-consent attributes (e.g. FERPA=Withheld but HasOptedOutOfEmail=false). Privacy regulators routinely sample this surface.",
  severity: "ERROR",
  entity: "Contact",
  field: "hed__FERPA__c",
  enabledByDefault: true,
  evaluate(input) {
    const r = rec(input);
    const ferpa = String(r["hed__FERPA__c"] ?? "");
    const optedOut = r["HasOptedOutOfEmail"];
    if (ferpa === "Withheld" && optedOut === false) {
      return fail(
        `Contact ${String(r["Id"] ?? "")} has FERPA=Withheld but is NOT opted out of email`
      );
    }
    return pass();
  },
};

/** Rule 07 — Stale Lead converted to Contact without programme link. */
const STALE_LEAD_NO_PROGRAMME: FnAuditRule = {
  id: "SALESFORCE-EDU-07",
  family: FAMILY,
  name: "Lead-derived Contact missing programme link",
  description:
    "Contact records sourced from Lead conversion (LeadSource is non-null) must have at least one Programme Plan / Affiliation tying them to a programme of study. Otherwise the conversion is orphaned.",
  severity: "WARN",
  entity: "Contact",
  enabledByDefault: true,
  evaluate(input, context?: { contactToProgrammePlan?: Set<string> }) {
    const r = rec(input);
    const leadSource = r["LeadSource"];
    if (!leadSource) return pass();
    const id = String(r["Id"] ?? "");
    if (context?.contactToProgrammePlan && !context.contactToProgrammePlan.has(id)) {
      return fail(`Lead-converted Contact ${id} has no Programme Plan link`);
    }
    return pass();
  },
};

/** Rule 08 — Course Enrollment in inactive programme. */
const ENROLLMENT_IN_INACTIVE_PROGRAMME: FnAuditRule = {
  id: "SALESFORCE-EDU-08",
  family: FAMILY,
  name: "Course Enrollment in inactive Programme Plan",
  description:
    "hed__Course_Enrollment__c records pointing at a Programme Plan whose hed__Status__c is Closed/Withdrawn. These are usually stale and inflate active-enrolment counts.",
  severity: "WARN",
  entity: "CourseEnrollment",
  enabledByDefault: true,
  evaluate(input, context?: { programmePlanStatus?: Record<string, string> }) {
    const r = rec(input);
    const ppId = typeof r["hed__Program_Plan__c"] === "string" ? r["hed__Program_Plan__c"] : "";
    if (!ppId) return pass();
    const status = context?.programmePlanStatus?.[ppId];
    if (status && status !== "Current") {
      return fail(
        `Enrollment ${String(r["Id"] ?? "")} references Programme Plan ${ppId} with status "${status}"`
      );
    }
    return pass();
  },
};

export const SALESFORCE_EDU_NATIVE_RULES: AuditRule[] = [
  DUPLICATE_EMAIL,
  ORPHAN_AFFILIATION,
  PROGRAMME_PLAN_NO_ENROLLMENTS,
  CONTACT_WITHOUT_AFFILIATION,
  ENROLLMENT_WITHOUT_COURSE,
  FERPA_MISMATCH,
  STALE_LEAD_NO_PROGRAMME,
  ENROLLMENT_IN_INACTIVE_PROGRAMME,
];

export const SALESFORCE_EDU_NATIVE_AUDIT_PACK = {
  id: "salesforce-edu-native",
  version: "0.1.0",
  label: "Salesforce Education Cloud — native rules",
  description:
    "Source-native audit rules executing against raw Salesforce Education Cloud SObjects (Contact, Account, hed__ Program_Plan, hed__ Affiliation, hed__ Course_Enrollment, hed__ Course).",
  family: "SALESFORCE-EDU-NATIVE" as const,
  rules: SALESFORCE_EDU_NATIVE_RULES as ReadonlyArray<AuditRule>,
};

export type SalesforceEduNativeRuleId =
  | "SALESFORCE-EDU-01"
  | "SALESFORCE-EDU-02"
  | "SALESFORCE-EDU-03"
  | "SALESFORCE-EDU-04"
  | "SALESFORCE-EDU-05"
  | "SALESFORCE-EDU-06"
  | "SALESFORCE-EDU-07"
  | "SALESFORCE-EDU-08";
