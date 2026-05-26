import { describe, it, expect } from "vitest";
import { SITS_NATIVE_RULES, SITS_NATIVE_AUDIT_PACK } from "../index.js";

describe("SITS native audit pack", () => {
  it("ships exactly 10 rules (SITS_DATA_STRUCTURES §19)", () => {
    expect(SITS_NATIVE_RULES).toHaveLength(10);
  });

  it("all rule ids are unique and follow SITS-NAT-NN", () => {
    const ids = SITS_NATIVE_RULES.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^SITS-NAT-\d{2}$/);
    }
  });

  it("every rule belongs to family SITS-INTEGRITY", () => {
    for (const r of SITS_NATIVE_RULES) {
      expect(r.family).toBe("SITS-INTEGRITY");
    }
  });

  it("every rule is a SqlAuditRule with a tenant-scoped predicate", () => {
    for (const r of SITS_NATIVE_RULES) {
      expect(r.type).toBe("sql");
      if (r.type === "sql") {
        expect(r.sql).toMatch(/:tenantId/);
        expect(r.messageTemplate).toMatch(/\{\{subject_id\}\}/);
      }
    }
  });

  it("severity is one of the canonical levels", () => {
    const allowed = new Set(["CRITICAL", "ERROR", "WARN", "INFO"]);
    for (const r of SITS_NATIVE_RULES) {
      expect(allowed.has(r.severity)).toBe(true);
    }
  });

  it("pack metadata aggregates correctly", () => {
    expect(SITS_NATIVE_AUDIT_PACK.rules).toBe(SITS_NATIVE_RULES);
    expect(SITS_NATIVE_AUDIT_PACK.family).toBe("SITS-INTEGRITY");
    expect(SITS_NATIVE_AUDIT_PACK.id).toBe("sits-native");
  });

  it("covers each SITS §19 hook by name keyword", () => {
    const blob = SITS_NATIVE_RULES.map((r) => r.name + " " + r.description)
      .join(" \n ")
      .toLowerCase();
    // 10 §19 hooks must be represented somewhere in the rule names/descriptions
    expect(blob).toMatch(/orphan/);                  // 1. STU with no MST
    expect(blob).toMatch(/saw award/);               // 2. SCJ CC with no SAW
    expect(blob).toMatch(/smo module/);              // 3. SCE R with no SMO
    expect(blob).toMatch(/zero credit/);             // 4. SMR P with smr_crda 0
    expect(blob).toMatch(/mab/);                     // 5. SAT no MAB
    expect(blob).toMatch(/highest qualification/);   // 6. scj_hiqp empty
    expect(blob).toMatch(/cas|visa/);                // 7. VCR expired CAS
    expect(blob).toMatch(/date of death|stu_dod/);   // 8. stu_dod set
    expect(blob).toMatch(/graduation date|saw_grdd/);// 9. SAW class no grdd
    expect(blob).toMatch(/udf|gdpr/);                // 10. UDF unmanaged PII
  });
});
