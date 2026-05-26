import { describe, it, expect } from "vitest";
import {
  WORKDAY_NATIVE_RULES,
  WORKDAY_NATIVE_AUDIT_PACK,
} from "../rules/index.js";

describe("Workday Student native audit pack", () => {
  it("ships 16 rules (one per §19 hook)", () => {
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

  it("every rule is a SqlAuditRule with a messageTemplate", () => {
    for (const r of WORKDAY_NATIVE_RULES) {
      expect(r.type).toBe("sql");
      if (r.type === "sql") {
        expect(r.sql.length).toBeGreaterThan(20);
        expect(r.messageTemplate).toMatch(/\{\{subject_id\}\}/);
      }
    }
  });

  it("severity is one of the canonical levels", () => {
    const allowed = new Set(["CRITICAL", "ERROR", "WARN", "INFO"]);
    for (const r of WORKDAY_NATIVE_RULES) {
      expect(allowed.has(r.severity)).toBe(true);
    }
  });

  it("every rule carries a dotted wd.* §19 namespace tag", () => {
    for (const r of WORKDAY_NATIVE_RULES) {
      const tags = r.tags ?? [];
      expect(tags.some((t) => t.startsWith("wd."))).toBe(true);
    }
  });

  it("covers each §19 surface (identity, programme, registration, marks, awards, hesa, bp, finance)", () => {
    const tagBlob = WORKDAY_NATIVE_RULES.flatMap((r) => r.tags ?? []).join("|");
    expect(tagBlob).toMatch(/wd\.person\./);                  // 19.1
    expect(tagBlob).toMatch(/wd\.programme\./);               // 19.2
    expect(tagBlob).toMatch(/wd\.registration\./);            // 19.3
    expect(tagBlob).toMatch(/wd\.grade\./);                   // 19.4
    expect(tagBlob).toMatch(/wd\.award\./);                   // 19.5
    expect(tagBlob).toMatch(/wd\.hesa\./);                    // 19.6
    expect(tagBlob).toMatch(/wd\.bp\./);                      // 19.7
    expect(tagBlob).toMatch(/wd\.fee\./);                     // 19.8
  });

  it("pack metadata aggregates correctly", () => {
    expect(WORKDAY_NATIVE_AUDIT_PACK.rules).toBe(WORKDAY_NATIVE_RULES);
    expect(WORKDAY_NATIVE_AUDIT_PACK.family).toBe("WORKDAY-INTEGRITY");
    expect(WORKDAY_NATIVE_AUDIT_PACK.id).toBe("workday-native");
  });

  it("every CRITICAL rule cites a UCISA benchmark for traceability", () => {
    const criticals = WORKDAY_NATIVE_RULES.filter((r) => r.severity === "CRITICAL");
    expect(criticals.length).toBeGreaterThan(0);
    for (const r of criticals) {
      expect(r.ucisa_benchmark_ref).toMatch(/^UCISA-/);
    }
  });
});
