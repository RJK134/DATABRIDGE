import { describe, it, expect } from "vitest";
import type { FnAuditRule } from "@databridge/rule-core";
import { DYNAMICS365_EDU_NATIVE_RULES, DYNAMICS365_EDU_NATIVE_AUDIT_PACK } from "../index.js";

function asFn(id: string): FnAuditRule {
  const r = DYNAMICS365_EDU_NATIVE_RULES.find((x) => x.id === id);
  if (!r) throw new Error(`rule ${id} not found`);
  return r as FnAuditRule;
}

describe("DYNAMICS365_EDU_NATIVE pack", () => {
  it("exposes 8 rules under family DYNAMICS365-EDU-NATIVE", () => {
    expect(DYNAMICS365_EDU_NATIVE_RULES).toHaveLength(8);
    for (const r of DYNAMICS365_EDU_NATIVE_RULES) {
      expect(r.family).toBe("DYNAMICS365-EDU-NATIVE");
    }
    expect(DYNAMICS365_EDU_NATIVE_AUDIT_PACK.id).toBe("dynamics365-edu-native");
  });

  it("Duplicate-email rule flags second sighting", () => {
    const r = asFn("DYNAMICS365-EDU-01");
    const ctx = { seenEmails: new Set<string>() };
    expect(r.evaluate({ contactid: "a", emailaddress1: "a@x" }, ctx).pass).toBe(true);
    expect(r.evaluate({ contactid: "b", emailaddress1: "a@x" }, ctx).pass).toBe(false);
  });

  it("Orphan StudentProgram triggers when msdyn_program is null", () => {
    const r = asFn("DYNAMICS365-EDU-02");
    expect(r.evaluate({ msdyn_studentprogramid: "sp1" }).pass).toBe(false);
    expect(r.evaluate({ msdyn_studentprogramid: "sp2", msdyn_program: "p1" }).pass).toBe(true);
  });

  it("Active program without students flags only programmes with status=1 (Active)", () => {
    const r = asFn("DYNAMICS365-EDU-03");
    const ctx = { studentsByProgram: new Set<string>(["p1"]) };
    expect(r.evaluate({ msdyn_programid: "p1", msdyn_programstatus: 1 }, ctx).pass).toBe(true);
    expect(r.evaluate({ msdyn_programid: "p2", msdyn_programstatus: 1 }, ctx).pass).toBe(false);
    expect(r.evaluate({ msdyn_programid: "p3", msdyn_programstatus: 2 }, ctx).pass).toBe(true);
  });

  it("Student contact rule fires only when msdyn_studentid is present", () => {
    const r = asFn("DYNAMICS365-EDU-04");
    const ctx = { studentprogramContactIds: new Set<string>(["c1"]) };
    expect(r.evaluate({ contactid: "c0" }, ctx).pass).toBe(true);
    expect(r.evaluate({ contactid: "c1", msdyn_studentid: "S1" }, ctx).pass).toBe(true);
    expect(r.evaluate({ contactid: "c2", msdyn_studentid: "S2" }, ctx).pass).toBe(false);
  });

  it("CourseInstance-without-Course rule triggers correctly", () => {
    const r = asFn("DYNAMICS365-EDU-05");
    expect(r.evaluate({ msdyn_courseinstanceid: "ci1" }).pass).toBe(false);
    expect(r.evaluate({ msdyn_courseinstanceid: "ci2", msdyn_course: "c1" }).pass).toBe(true);
  });

  it("Privacy-mismatch triggers when opted-out + on marketing list", () => {
    const r = asFn("DYNAMICS365-EDU-06");
    const ctx = { contactsInMarketingList: new Set<string>(["c1"]) };
    expect(r.evaluate({ contactid: "c1", donotbulkemail: true }, ctx).pass).toBe(false);
    expect(r.evaluate({ contactid: "c1", donotemail: true }, ctx).pass).toBe(false);
    expect(r.evaluate({ contactid: "c1" }, ctx).pass).toBe(true);
    expect(r.evaluate({ contactid: "c2", donotbulkemail: true }, ctx).pass).toBe(true);
  });

  it("Stale lead-derived contact fires only with originatingleadid", () => {
    const r = asFn("DYNAMICS365-EDU-07");
    const ctx = { contactToProgram: new Set<string>(["c1"]) };
    expect(r.evaluate({ contactid: "c1", originatingleadid: "L1" }, ctx).pass).toBe(true);
    expect(r.evaluate({ contactid: "c2", originatingleadid: "L1" }, ctx).pass).toBe(false);
    expect(r.evaluate({ contactid: "c3" }, ctx).pass).toBe(true);
  });

  it("StudentProgram against inactive Program triggers when status != 1", () => {
    const r = asFn("DYNAMICS365-EDU-08");
    const ctx = { programStatus: { p1: 2, p2: 1 } };
    expect(r.evaluate({ msdyn_studentprogramid: "sp1", msdyn_program: "p1" }, ctx).pass).toBe(
      false
    );
    expect(r.evaluate({ msdyn_studentprogramid: "sp2", msdyn_program: "p2" }, ctx).pass).toBe(true);
    expect(r.evaluate({ msdyn_studentprogramid: "sp3" }, ctx).pass).toBe(true);
  });

  it("rule ids are unique and stable", () => {
    const ids = DYNAMICS365_EDU_NATIVE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^DYNAMICS365-EDU-\d{2}$/);
  });
});
