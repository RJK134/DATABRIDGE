import { describe, it, expect } from "vitest";
import { findingFromSqlRow, AuditFindingStatusZ } from "../finding.js";

describe("AuditFinding — Phase G provenance fields", () => {
  it("factory preserves sourceSystem + nativeKeys + ruleProvenance + runId", () => {
    const f = findingFromSqlRow({
      ruleId: "banner-integrity.B01",
      ruleName: "PIDM without current SPRIDEN",
      severity: "ERROR",
      entityType: "Student",
      row: { subject_id: "82045", pidm: 82045 },
      messageTemplate: "PIDM {{pidm}} has no current SPRIDEN row",
      tenantId: "t1",
      sourceSystem: "banner-oracle",
      nativeKeys: { pidm: 82045 },
      ruleProvenance: {
        kind: "sql",
        predicate:
          "SELECT pidm AS subject_id, pidm FROM spriden WHERE change_ind IS NULL GROUP BY pidm HAVING COUNT(*) = 0",
      },
      runId: "run-abc",
    });
    expect(f.sourceSystem).toBe("banner-oracle");
    expect(f.nativeKeys?.["pidm"]).toBe(82045);
    expect(f.ruleProvenance?.kind).toBe("sql");
    expect(f.runId).toBe("run-abc");
    expect(f.message).toContain("82045");
  });

  it("factory omits provenance fields when not supplied (exactOptionalPropertyTypes)", () => {
    const f = findingFromSqlRow({
      ruleId: "r1",
      ruleName: "r1",
      severity: "WARN",
      entityType: "Student",
      row: { subject_id: "1" },
      messageTemplate: "m",
      tenantId: "t",
    });
    expect("sourceSystem" in f).toBe(false);
    expect("nativeKeys" in f).toBe(false);
    expect("ruleProvenance" in f).toBe(false);
    expect("runId" in f).toBe(false);
  });

  it('AuditFindingStatusZ now includes "waived"', () => {
    expect(() => AuditFindingStatusZ.parse("waived")).not.toThrow();
    expect(() => AuditFindingStatusZ.parse("open")).not.toThrow();
    expect(() => AuditFindingStatusZ.parse("nonsense")).toThrow();
  });
});
