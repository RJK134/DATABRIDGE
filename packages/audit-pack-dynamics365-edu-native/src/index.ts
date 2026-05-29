/**
 * @databridge/audit-pack-dynamics365-edu-native
 *
 * Eight source-native rules that execute against raw Dataverse entities
 * (contact, account, msdyn_program, msdyn_studentprogram,
 * msdyn_courseinstance, msdyn_course).
 *
 * Family: DYNAMICS365-EDU-NATIVE.
 */
import type { AuditRule, FnAuditRule, FnRuleResult } from "@databridge/rule-core";

const FAMILY = "DYNAMICS365-EDU-NATIVE" as const;

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

/** 01 — Duplicate contact by emailaddress1. */
const DUPLICATE_EMAIL: FnAuditRule = {
  id: "DYNAMICS365-EDU-01",
  family: FAMILY,
  name: "Duplicate contact by emailaddress1",
  description:
    "Two or more contact rows share the same emailaddress1. Dataverse does not enforce uniqueness on this column; downstream Power Pages / Customer Journey breaks.",
  severity: "ERROR",
  entity: "Contact",
  field: "emailaddress1",
  enabledByDefault: true,
  evaluate(input, context?: { seenEmails?: Set<string> }) {
    const r = rec(input);
    const email =
      typeof r["emailaddress1"] === "string"
        ? (r["emailaddress1"] as string).trim().toLowerCase()
        : "";
    if (!email) return pass();
    if (context?.seenEmails) {
      if (context.seenEmails.has(email)) {
        return fail(`Contact with duplicate emailaddress1 "${email}"`, {
          contactid: r["contactid"],
        });
      }
      context.seenEmails.add(email);
    }
    return pass();
  },
};

/** 02 — Orphan student-programme (no parent account). */
const ORPHAN_STUDENT_PROGRAM: FnAuditRule = {
  id: "DYNAMICS365-EDU-02",
  family: FAMILY,
  name: "msdyn_studentprogram missing msdyn_program",
  description:
    "Every msdyn_studentprogram row must reference a non-null msdyn_program. Orphans indicate a stalled enrolment workflow.",
  severity: "ERROR",
  entity: "StudentProgram",
  field: "msdyn_program",
  enabledByDefault: true,
  evaluate(input) {
    const r = rec(input);
    if (!r["msdyn_program"]) {
      return fail(
        `StudentProgram ${String(r["msdyn_studentprogramid"] ?? "<unknown>")} has no programme link`
      );
    }
    return pass();
  },
};

/** 03 — Active programme without student-programme rows. */
const PROGRAM_NO_STUDENTS: FnAuditRule = {
  id: "DYNAMICS365-EDU-03",
  family: FAMILY,
  name: "Active msdyn_program without student programmes",
  description:
    "An msdyn_program with status=Active should have ≥ 1 msdyn_studentprogram row. Empty programmes inflate the catalogue and confuse recruitment dashboards.",
  severity: "WARN",
  entity: "Program",
  enabledByDefault: true,
  evaluate(input, context?: { studentsByProgram?: Set<string> }) {
    const r = rec(input);
    const status = r["msdyn_programstatus"];
    // Dataverse option-set: 1 = Active. Treat non-1 as not-active.
    if (status !== 1 && status !== "1") return pass();
    const id = String(r["msdyn_programid"] ?? "");
    if (context?.studentsByProgram && !context.studentsByProgram.has(id)) {
      return fail(`Active Program ${id} has no student-programme rows`);
    }
    return pass();
  },
};

/** 04 — Contact without an active studentprogram. */
const CONTACT_WITHOUT_STUDENTPROGRAM: FnAuditRule = {
  id: "DYNAMICS365-EDU-04",
  family: FAMILY,
  name: "Student contact without studentprogram",
  description:
    "A contact flagged as a student (msdyn_studentid is non-null) but with no msdyn_studentprogram row. Such contacts are invisible to programme-level analytics.",
  severity: "WARN",
  entity: "Contact",
  enabledByDefault: true,
  evaluate(input, context?: { studentprogramContactIds?: Set<string> }) {
    const r = rec(input);
    const isStudent = r["msdyn_studentid"];
    if (!isStudent) return pass();
    const id = String(r["contactid"] ?? "");
    if (context?.studentprogramContactIds && !context.studentprogramContactIds.has(id)) {
      return fail(`Contact ${id} is flagged as student but has no msdyn_studentprogram`);
    }
    return pass();
  },
};

/** 05 — Course-instance referencing a deleted course. */
const COURSEINSTANCE_NO_COURSE: FnAuditRule = {
  id: "DYNAMICS365-EDU-05",
  family: FAMILY,
  name: "msdyn_courseinstance missing msdyn_course",
  description:
    "msdyn_courseinstance must reference an msdyn_course. Dangling instances break the catalogue.",
  severity: "ERROR",
  entity: "CourseInstance",
  field: "msdyn_course",
  enabledByDefault: true,
  evaluate(input) {
    const r = rec(input);
    if (!r["msdyn_course"]) {
      return fail(
        `CourseInstance ${String(r["msdyn_courseinstanceid"] ?? "<unknown>")} has no parent course`
      );
    }
    return pass();
  },
};

/** 06 — Privacy preference mismatch (Power Pages / Customer Insights). */
const PRIVACY_MISMATCH: FnAuditRule = {
  id: "DYNAMICS365-EDU-06",
  family: FAMILY,
  name: "Privacy preference mismatch on contact",
  description:
    "donotbulkemail/donotemail set true while the contact has marketing-list memberships. UK PECR enforcement targets this surface.",
  severity: "ERROR",
  entity: "Contact",
  enabledByDefault: true,
  evaluate(input, context?: { contactsInMarketingList?: Set<string> }) {
    const r = rec(input);
    const doNotBulk = r["donotbulkemail"] === true || r["donotbulkemail"] === "true";
    const doNotEmail = r["donotemail"] === true || r["donotemail"] === "true";
    if (!doNotBulk && !doNotEmail) return pass();
    const id = String(r["contactid"] ?? "");
    if (context?.contactsInMarketingList?.has(id)) {
      return fail(`Contact ${id} has email opt-out flags but is still on a marketing list`);
    }
    return pass();
  },
};

/** 07 — Stale lead-derived contact without programme. */
const STALE_LEAD_NO_PROGRAMME: FnAuditRule = {
  id: "DYNAMICS365-EDU-07",
  family: FAMILY,
  name: "Lead-converted contact missing programme",
  description:
    "Contact derived from lead conversion (originatingleadid is non-null) must have at least one msdyn_studentprogram tying them to a programme.",
  severity: "WARN",
  entity: "Contact",
  enabledByDefault: true,
  evaluate(input, context?: { contactToProgram?: Set<string> }) {
    const r = rec(input);
    if (!r["originatingleadid"]) return pass();
    const id = String(r["contactid"] ?? "");
    if (context?.contactToProgram && !context.contactToProgram.has(id)) {
      return fail(`Lead-converted contact ${id} has no programme`);
    }
    return pass();
  },
};

/** 08 — Student program against inactive programme. */
const STUDENTPROGRAM_INACTIVE_PROGRAM: FnAuditRule = {
  id: "DYNAMICS365-EDU-08",
  family: FAMILY,
  name: "msdyn_studentprogram against inactive Program",
  description:
    "msdyn_studentprogram pointing at an msdyn_program with status != Active. Usually stale; inflates active-enrolment counts.",
  severity: "WARN",
  entity: "StudentProgram",
  enabledByDefault: true,
  evaluate(input, context?: { programStatus?: Record<string, number | string> }) {
    const r = rec(input);
    const prog = typeof r["msdyn_program"] === "string" ? r["msdyn_program"] : "";
    if (!prog) return pass();
    const status = context?.programStatus?.[prog];
    if (status !== undefined && status !== 1 && status !== "1") {
      return fail(
        `StudentProgram ${String(r["msdyn_studentprogramid"] ?? "")} references inactive Program ${prog} (status ${status})`
      );
    }
    return pass();
  },
};

export const DYNAMICS365_EDU_NATIVE_RULES: AuditRule[] = [
  DUPLICATE_EMAIL,
  ORPHAN_STUDENT_PROGRAM,
  PROGRAM_NO_STUDENTS,
  CONTACT_WITHOUT_STUDENTPROGRAM,
  COURSEINSTANCE_NO_COURSE,
  PRIVACY_MISMATCH,
  STALE_LEAD_NO_PROGRAMME,
  STUDENTPROGRAM_INACTIVE_PROGRAM,
];

export const DYNAMICS365_EDU_NATIVE_AUDIT_PACK = {
  id: "dynamics365-edu-native",
  version: "0.1.0",
  label: "Microsoft Dynamics 365 Education — native rules",
  description:
    "Source-native audit rules executing against raw Dataverse entities for Dynamics 365 Education (contact, account, msdyn_program, msdyn_studentprogram, msdyn_courseinstance, msdyn_course).",
  family: "DYNAMICS365-EDU-NATIVE" as const,
  rules: DYNAMICS365_EDU_NATIVE_RULES as ReadonlyArray<AuditRule>,
};

export type Dynamics365EduNativeRuleId =
  | "DYNAMICS365-EDU-01"
  | "DYNAMICS365-EDU-02"
  | "DYNAMICS365-EDU-03"
  | "DYNAMICS365-EDU-04"
  | "DYNAMICS365-EDU-05"
  | "DYNAMICS365-EDU-06"
  | "DYNAMICS365-EDU-07"
  | "DYNAMICS365-EDU-08";
