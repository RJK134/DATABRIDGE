import { describe, it, expect } from "vitest";
import type { FnAuditRule } from "@databridge/rule-core";
import { SALESFORCE_EDU_NATIVE_RULES, SALESFORCE_EDU_NATIVE_AUDIT_PACK } from "../index.js";

function asFn(id: string): FnAuditRule {
  const r = SALESFORCE_EDU_NATIVE_RULES.find((x) => x.id === id);
  if (!r) throw new Error(`rule ${id} not found`);
  return r as FnAuditRule;
}

describe("SALESFORCE_EDU_NATIVE pack", () => {
  it("exposes 8 rules under family SALESFORCE-EDU-NATIVE", () => {
    expect(SALESFORCE_EDU_NATIVE_RULES).toHaveLength(8);
    for (const r of SALESFORCE_EDU_NATIVE_RULES) {
      expect(r.family).toBe("SALESFORCE-EDU-NATIVE");
    }
    expect(SALESFORCE_EDU_NATIVE_AUDIT_PACK.id).toBe("salesforce-edu-native");
  });

  it("Duplicate-email rule flags second sighting of the same email", () => {
    const r = asFn("SALESFORCE-EDU-01");
    const ctx = { seenEmails: new Set<string>() };
    const first = r.evaluate({ record: { Id: "001a", Email: "a@x.test" } }, ctx);
    expect(first.pass).toBe(true);
    const second = r.evaluate({ record: { Id: "001b", Email: "a@x.test" } }, ctx);
    expect(second.pass).toBe(false);
    expect(second.message).toMatch(/duplicate/);
  });

  it("Duplicate-email rule accepts a record directly", () => {
    const r = asFn("SALESFORCE-EDU-01");
    expect(r.evaluate({ Id: "001a", Email: "" }, { seenEmails: new Set() }).pass).toBe(true);
  });

  it("Orphan-affiliation flags rows with no hed__Account__c", () => {
    const r = asFn("SALESFORCE-EDU-02");
    expect(r.evaluate({ Id: "aff1" }).pass).toBe(false);
    expect(r.evaluate({ Id: "aff2", hed__Account__c: "001" }).pass).toBe(true);
  });

  it("Programme-Plan-without-enrolments only flags Current plans", () => {
    const r = asFn("SALESFORCE-EDU-03");
    const ctx = { enrollmentsByProgrammePlan: new Set<string>(["p1"]) };
    expect(r.evaluate({ Id: "p1", hed__Status__c: "Current" }, ctx).pass).toBe(true);
    expect(r.evaluate({ Id: "p2", hed__Status__c: "Current" }, ctx).pass).toBe(false);
    expect(r.evaluate({ Id: "p3", hed__Status__c: "Closed" }, ctx).pass).toBe(true);
  });

  it("Contact-without-Affiliation rule flags missing memberships", () => {
    const r = asFn("SALESFORCE-EDU-04");
    const ctx = { affiliationContactIds: new Set<string>(["001a"]) };
    expect(r.evaluate({ Id: "001a" }, ctx).pass).toBe(true);
    expect(r.evaluate({ Id: "001b" }, ctx).pass).toBe(false);
  });

  it("Enrollment-without-Course flags missing hed__Course_Offering__c", () => {
    const r = asFn("SALESFORCE-EDU-05");
    expect(r.evaluate({ Id: "e1" }).pass).toBe(false);
    expect(r.evaluate({ Id: "e2", hed__Course_Offering__c: "co1" }).pass).toBe(true);
  });

  it("FERPA-mismatch detects Withheld + HasOptedOutOfEmail=false", () => {
    const r = asFn("SALESFORCE-EDU-06");
    expect(
      r.evaluate({ Id: "001", hed__FERPA__c: "Withheld", HasOptedOutOfEmail: false }).pass
    ).toBe(false);
    expect(
      r.evaluate({ Id: "002", hed__FERPA__c: "Withheld", HasOptedOutOfEmail: true }).pass
    ).toBe(true);
    expect(
      r.evaluate({ Id: "003", hed__FERPA__c: "Granted", HasOptedOutOfEmail: false }).pass
    ).toBe(true);
  });

  it("Stale-Lead rule only fires when LeadSource is non-null and link missing", () => {
    const r = asFn("SALESFORCE-EDU-07");
    const ctx = { contactToProgrammePlan: new Set<string>(["001a"]) };
    expect(r.evaluate({ Id: "001a", LeadSource: "Web" }, ctx).pass).toBe(true);
    expect(r.evaluate({ Id: "001b", LeadSource: "Web" }, ctx).pass).toBe(false);
    expect(r.evaluate({ Id: "001c" }, ctx).pass).toBe(true);
  });

  it("Enrollment-in-inactive-programme rule respects programmePlanStatus", () => {
    const r = asFn("SALESFORCE-EDU-08");
    const ctx = { programmePlanStatus: { p1: "Closed", p2: "Current" } };
    expect(r.evaluate({ Id: "e1", hed__Program_Plan__c: "p1" }, ctx).pass).toBe(false);
    expect(r.evaluate({ Id: "e2", hed__Program_Plan__c: "p2" }, ctx).pass).toBe(true);
    expect(r.evaluate({ Id: "e3" }, ctx).pass).toBe(true);
  });

  it("rule ids are unique and stable", () => {
    const ids = SALESFORCE_EDU_NATIVE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^SALESFORCE-EDU-\d{2}$/);
  });
});
