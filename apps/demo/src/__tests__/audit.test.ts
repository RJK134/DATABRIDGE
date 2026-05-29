import { describe, it, expect } from "vitest";
import { runFixtureAudit } from "../audit.js";
import { SALESFORCE_EDU_NATIVE_RULES } from "@databridge/audit-pack-salesforce-edu-native";
import { DYNAMICS365_EDU_NATIVE_RULES } from "@databridge/audit-pack-dynamics365-edu-native";

describe("runFixtureAudit", () => {
  it("evaluates the Salesforce native rules and surfaces duplicate-email findings", () => {
    const report = runFixtureAudit(
      {
        rows: [
          {
            Id: "001a",
            Email: "shared@x.test",
            hed__Account__c: "acc1",
            hed__Course_Offering__c: "co1",
          },
          {
            Id: "001b",
            Email: "shared@x.test",
            hed__Account__c: "acc1",
            hed__Course_Offering__c: "co1",
          },
        ],
      },
      SALESFORCE_EDU_NATIVE_RULES
    );
    expect(report.findingsTotal).toBeGreaterThan(0);
    expect(report.findings.some((f) => f.ruleId === "SALESFORCE-EDU-01")).toBe(true);
  });

  it("evaluates the Dynamics rules and surfaces orphan studentprogram", () => {
    const report = runFixtureAudit(
      {
        rows: [
          { msdyn_studentprogramid: "sp1" },
          { msdyn_studentprogramid: "sp2", msdyn_program: "p1" },
        ],
      },
      DYNAMICS365_EDU_NATIVE_RULES
    );
    expect(report.findings.some((f) => f.ruleId === "DYNAMICS365-EDU-02")).toBe(true);
  });

  it("aggregates findings by severity", () => {
    const report = runFixtureAudit(
      {
        rows: [{ Id: "x", Email: "a@x", hed__Account__c: null, hed__Course_Offering__c: null }],
      },
      SALESFORCE_EDU_NATIVE_RULES
    );
    expect(Object.values(report.bySeverity).reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(
      report.findingsTotal
    );
  });

  it("does not throw on empty rows", () => {
    const report = runFixtureAudit({ rows: [] }, SALESFORCE_EDU_NATIVE_RULES);
    expect(report.findingsTotal).toBe(0);
    expect(report.rulesEvaluated).toBe(SALESFORCE_EDU_NATIVE_RULES.length);
  });
});
