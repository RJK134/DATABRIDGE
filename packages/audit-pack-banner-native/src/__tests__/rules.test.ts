import { describe, it, expect } from "vitest";
import { BANNER_NATIVE_RULES, BANNER_NATIVE_AUDIT_PACK } from "../index.js";

describe("Banner native audit pack", () => {
  it("ships exactly 10 rules (BANNER_DATA_STRUCTURES §17)", () => {
    expect(BANNER_NATIVE_RULES).toHaveLength(10);
  });

  it("all rule ids are unique and follow BANNER-NAT-NN", () => {
    const ids = BANNER_NATIVE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^BANNER-NAT-\d{2}$/);
    }
  });

  it("every rule belongs to family BANNER-INTEGRITY", () => {
    for (const r of BANNER_NATIVE_RULES) {
      expect(r.family).toBe("BANNER-INTEGRITY");
    }
  });

  it("every rule is a SqlAuditRule with subject_id selector", () => {
    for (const r of BANNER_NATIVE_RULES) {
      expect(r.type).toBe("sql");
      if (r.type === "sql") {
        expect(r.sql.toLowerCase()).toMatch(/as subject_id/);
        expect(r.messageTemplate).toMatch(/\{\{subject_id\}\}/);
      }
    }
  });

  it("severity is one of the canonical levels", () => {
    const allowed = new Set(["CRITICAL", "ERROR", "WARN", "INFO"]);
    for (const r of BANNER_NATIVE_RULES) {
      expect(allowed.has(r.severity)).toBe(true);
    }
  });

  it("pack metadata aggregates correctly", () => {
    expect(BANNER_NATIVE_AUDIT_PACK.rules).toBe(BANNER_NATIVE_RULES);
    expect(BANNER_NATIVE_AUDIT_PACK.family).toBe("BANNER-INTEGRITY");
    expect(BANNER_NATIVE_AUDIT_PACK.id).toBe("banner-native");
  });

  it("covers each Banner §17 hook by name/description keyword", () => {
    const blob = BANNER_NATIVE_RULES.map((r) => r.name + " " + r.description)
      .join(" \n ")
      .toLowerCase();
    expect(blob).toMatch(/spriden/);          // 1. PIDM no SPRIDEN
    expect(blob).toMatch(/sorlcur/);          // 2. SGBSTDN no SORLCUR
    expect(blob).toMatch(/ssbsect|sfrstcr/);  // 3. SFRSTCR no SSBSECT
    expect(blob).toMatch(/shrtckg|shrtckn/);  // 4. SHRTCKG no SHRTCKN
    expect(blob).toMatch(/spbpers|birth/);    // 5. SPBPERS DOB > entry
    expect(blob).toMatch(/terminal/);         // 6. SGBSTDN terminal stvstst
    expect(blob).toMatch(/tbraccd|balance/);  // 7. TBRACCD non-zero
    expect(blob).toMatch(/gorvisa|visa/);     // 8. GORVISA expired
    expect(blob).toMatch(/saradap|admit/);    // 9. SARADAP admit no SGBSTDN
    expect(blob).toMatch(/shrdgmr|outcome/);  // 10. SHRDGMR AW null date
  });
});
