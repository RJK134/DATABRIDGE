import { describe, it, expect } from "vitest";
import { generateIntegrationPrepReport } from "../index.js";

describe("generateIntegrationPrepReport", () => {
  it("marks records present in source but missing in target as 'create'", () => {
    const report = generateIntegrationPrepReport({
      source: [{ studentId: "S1", lastName: "Smith" }],
      target: [],
      sourceLabel: "SITS",
      targetLabel: "Salesforce",
      options: {
        sourceKey: "studentId",
        targetKey: "External_Id__c",
        compareFields: ["lastName"],
      },
    });
    expect(report.totals.create).toBe(1);
    expect(report.findings[0]?.verdict).toBe("create");
  });

  it("emits 'update' findings with field deltas when source and target differ", () => {
    const report = generateIntegrationPrepReport({
      source: [{ studentId: "S1", lastName: "Smith", email: "x@y" }],
      target: [{ External_Id__c: "S1", lastName: "Jones", email: "x@y", Id: "001a" }],
      sourceLabel: "SITS",
      targetLabel: "Salesforce",
      options: {
        sourceKey: "studentId",
        targetKey: "External_Id__c",
        compareFields: ["lastName", "email"],
      },
    });
    expect(report.totals.update).toBe(1);
    expect(report.findings[0]?.deltas).toHaveLength(1);
    expect(report.findings[0]?.deltas?.[0]?.field).toBe("lastName");
    expect(report.findings[0]?.targetId).toBe("S1");
  });

  it("marks identical rows as 'skip' (no diff)", () => {
    const report = generateIntegrationPrepReport({
      source: [{ studentId: "S1", lastName: "Smith" }],
      target: [{ External_Id__c: "S1", lastName: "Smith", Id: "001a" }],
      sourceLabel: "SITS",
      targetLabel: "Salesforce",
      options: {
        sourceKey: "studentId",
        targetKey: "External_Id__c",
        compareFields: ["lastName"],
      },
    });
    expect(report.totals.skip).toBe(1);
    expect(report.findings[0]?.verdict).toBe("skip");
  });

  it("respects rejectIf predicate", () => {
    const report = generateIntegrationPrepReport({
      source: [
        { studentId: "S1", lastName: null },
        { studentId: "S2", lastName: "Ok" },
      ],
      target: [],
      sourceLabel: "SITS",
      targetLabel: "Salesforce",
      options: {
        sourceKey: "studentId",
        targetKey: "External_Id__c",
        compareFields: ["lastName"],
        rejectIf: (row) => (row["lastName"] == null ? "missing lastName" : null),
      },
    });
    expect(report.totals.reject).toBe(1);
    expect(report.findings[0]?.verdict).toBe("reject");
    expect(report.findings[0]?.reason).toBe("missing lastName");
  });

  it("skips source rows whose key is empty", () => {
    const report = generateIntegrationPrepReport({
      source: [{ studentId: "", lastName: "x" }],
      target: [],
      sourceLabel: "SITS",
      targetLabel: "Salesforce",
      options: {
        sourceKey: "studentId",
        targetKey: "External_Id__c",
        compareFields: ["lastName"],
      },
    });
    expect(report.totals.skip).toBe(1);
  });

  it("normalises keys case-insensitively by default", () => {
    const report = generateIntegrationPrepReport({
      source: [{ studentId: "S001", lastName: "Smith" }],
      target: [{ External_Id__c: "s001", lastName: "Smith", Id: "001" }],
      sourceLabel: "SITS",
      targetLabel: "Salesforce",
      options: {
        sourceKey: "studentId",
        targetKey: "External_Id__c",
        compareFields: ["lastName"],
      },
    });
    expect(report.totals.skip).toBe(1);
    expect(report.findings[0]?.verdict).toBe("skip");
  });

  it("respects a custom normaliseKey for case-sensitive matching", () => {
    const report = generateIntegrationPrepReport({
      source: [{ studentId: "S001", lastName: "Smith" }],
      target: [{ External_Id__c: "s001", lastName: "Smith", Id: "001" }],
      sourceLabel: "SITS",
      targetLabel: "Salesforce",
      options: {
        sourceKey: "studentId",
        targetKey: "External_Id__c",
        compareFields: ["lastName"],
        normaliseKey: (v) => (v == null ? "" : String(v)),
      },
    });
    expect(report.totals.create).toBe(1);
  });

  it("aggregates totals across a mixed batch", () => {
    const source = [
      { studentId: "S1", lastName: "Smith" },
      { studentId: "S2", lastName: "Bond" },
      { studentId: "S3", lastName: "Eaton" },
    ];
    const target = [
      { External_Id__c: "S1", lastName: "Smith", Id: "001" },
      { External_Id__c: "S2", lastName: "JonesOld", Id: "002" },
    ];
    const report = generateIntegrationPrepReport({
      source,
      target,
      sourceLabel: "SITS",
      targetLabel: "Salesforce",
      options: {
        sourceKey: "studentId",
        targetKey: "External_Id__c",
        compareFields: ["lastName"],
      },
    });
    expect(report.totals.create).toBe(1);
    expect(report.totals.update).toBe(1);
    expect(report.totals.skip).toBe(1);
  });
});
