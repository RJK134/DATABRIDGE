import { describe, it, expect } from "vitest";
import { TECHONE_FIN1_NATIVE_RULES, TECHONE_FIN1_NATIVE_AUDIT_PACK } from "../index.js";

describe("@databridge/audit-pack-techone-fin1-native", () => {
  it("ships exactly 13 rules (TECHONE_DATA_STRUCTURES §19)", () => {
    expect(TECHONE_FIN1_NATIVE_RULES).toHaveLength(13);
  });

  it("all rule ids are unique and follow TECHONE-FIN1-NN", () => {
    const ids = TECHONE_FIN1_NATIVE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^TECHONE-FIN1-\d{2}$/);
    }
  });

  it("every rule belongs to family TECHONE-FIN1-INTEGRITY", () => {
    for (const r of TECHONE_FIN1_NATIVE_RULES) {
      expect(r.family).toBe("TECHONE-FIN1-INTEGRITY");
    }
  });

  it("every rule is a SqlAuditRule with a tenant-scoped predicate and subject_id template", () => {
    for (const r of TECHONE_FIN1_NATIVE_RULES) {
      expect(r.type).toBe("sql");
      if (r.type === "sql") {
        expect(r.sql).toMatch(/:tenantId/);
        expect(r.messageTemplate).toMatch(/\{\{subject_id\}\}/);
      }
    }
  });

  it("severity is one of the canonical levels", () => {
    const allowed = new Set(["CRITICAL", "ERROR", "WARN", "INFO"]);
    for (const r of TECHONE_FIN1_NATIVE_RULES) {
      expect(allowed.has(r.severity)).toBe(true);
    }
  });

  it("CRITICAL rules cite a UCISA benchmark", () => {
    for (const r of TECHONE_FIN1_NATIVE_RULES) {
      if (r.severity === "CRITICAL") {
        expect(r.ucisa_benchmark_ref).toMatch(/^UCISA-/);
      }
    }
  });

  it("pack metadata aggregates correctly", () => {
    expect(TECHONE_FIN1_NATIVE_AUDIT_PACK.rules).toBe(TECHONE_FIN1_NATIVE_RULES);
    expect(TECHONE_FIN1_NATIVE_AUDIT_PACK.family).toBe("TECHONE-FIN1-INTEGRITY");
    expect(TECHONE_FIN1_NATIVE_AUDIT_PACK.id).toBe("techone-financeone-native");
  });

  it("re-exports are identity-equal to the adapter package source", async () => {
    const adapterPkg = await import("@databridge/adapter-techone-financeone");
    expect(TECHONE_FIN1_NATIVE_RULES).toBe(adapterPkg.TECHONE_FIN1_NATIVE_RULES);
    expect(TECHONE_FIN1_NATIVE_AUDIT_PACK).toBe(adapterPkg.TECHONE_FIN1_NATIVE_AUDIT_PACK);
  });
});
