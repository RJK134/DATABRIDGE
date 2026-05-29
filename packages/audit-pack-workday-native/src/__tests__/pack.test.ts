import { describe, it, expect } from "vitest";
import { WORKDAY_NATIVE_RULES, WORKDAY_NATIVE_AUDIT_PACK } from "../index.js";

describe("@databridge/audit-pack-workday-native", () => {
  it("ships exactly 16 rules", () => {
    expect(WORKDAY_NATIVE_RULES).toHaveLength(16);
  });

  it("all rule ids are unique and follow WORKDAY-NAT-NN", () => {
    const ids = WORKDAY_NATIVE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^WORKDAY-NAT-\d{2}$/);
    }
  });

  it("every rule belongs to family WORKDAY-INTEGRITY", () => {
    for (const r of WORKDAY_NATIVE_RULES) {
      expect(r.family).toBe("WORKDAY-INTEGRITY");
    }
  });

  it("severity is one of the canonical levels", () => {
    const allowed = new Set(["CRITICAL", "ERROR", "WARN", "INFO"]);
    for (const r of WORKDAY_NATIVE_RULES) {
      expect(allowed.has(r.severity)).toBe(true);
    }
  });

  it("CRITICAL rules cite a UCISA benchmark", () => {
    for (const r of WORKDAY_NATIVE_RULES) {
      if (r.severity === "CRITICAL") {
        expect(r.ucisa_benchmark_ref).toMatch(/^UCISA-/);
      }
    }
  });

  it("pack metadata aggregates correctly", () => {
    expect(WORKDAY_NATIVE_AUDIT_PACK.rules).toBe(WORKDAY_NATIVE_RULES);
    expect(WORKDAY_NATIVE_AUDIT_PACK.family).toBe("WORKDAY-INTEGRITY");
    expect(WORKDAY_NATIVE_AUDIT_PACK.id).toBe("workday-native");
  });

  it("re-exports are identity-equal to the adapter package source", async () => {
    const adapterPkg = await import("@databridge/adapter-workday-raas");
    expect(WORKDAY_NATIVE_RULES).toBe(adapterPkg.WORKDAY_NATIVE_RULES);
    expect(WORKDAY_NATIVE_AUDIT_PACK).toBe(adapterPkg.WORKDAY_NATIVE_AUDIT_PACK);
  });
});
