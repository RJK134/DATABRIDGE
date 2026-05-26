import { describe, it, expect } from "vitest";
import {
  TECHONE_FIN1_NATIVE_RULES,
  TECHONE_FIN1_NATIVE_AUDIT_PACK,
} from "../rules/index.js";

describe("TechOne Finance One native audit pack", () => {
  it("ships at least 13 rules (one per §19 hook + sub-hooks)", () => {
    expect(TECHONE_FIN1_NATIVE_RULES.length).toBeGreaterThanOrEqual(13);
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

  it("every rule is a SqlAuditRule with a messageTemplate", () => {
    for (const r of TECHONE_FIN1_NATIVE_RULES) {
      expect(r.type).toBe("sql");
      if (r.type === "sql") {
        expect(r.sql.length).toBeGreaterThan(20);
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

  it("every rule carries a dotted §19 namespace tag (techone.financeone.fin1.*)", () => {
    for (const r of TECHONE_FIN1_NATIVE_RULES) {
      const tags = r.tags ?? [];
      expect(tags.some((t) => t.startsWith("techone.financeone.fin1."))).toBe(true);
    }
  });

  it("covers each §19 hook surface (customer, invoice, sponsor, CN, GL, tax, interface, FX, census)", () => {
    const tagBlob = TECHONE_FIN1_NATIVE_RULES.flatMap((r) => r.tags ?? []).join("|");
    expect(tagBlob).toMatch(/customer_orphan|customer_status_mismatch/);
    expect(tagBlob).toMatch(/invoice_no_source|duplicate_invoice/);
    expect(tagBlob).toMatch(/sponsor_relationship_expired|bursary_no_approval/);
    expect(tagBlob).toMatch(/credit_note_no_link|sod_violation/);
    expect(tagBlob).toMatch(/invalid_chartfield_combination|tuition_gst_applied/);
    expect(tagBlob).toMatch(/staging_stuck_rows/);
    expect(tagBlob).toMatch(/fx_rate_stale/);
    expect(tagBlob).toMatch(/census_outstanding_missing/);
  });

  it("pack metadata aggregates correctly", () => {
    expect(TECHONE_FIN1_NATIVE_AUDIT_PACK.rules).toBe(TECHONE_FIN1_NATIVE_RULES);
    expect(TECHONE_FIN1_NATIVE_AUDIT_PACK.family).toBe("TECHONE-FIN1-INTEGRITY");
    expect(TECHONE_FIN1_NATIVE_AUDIT_PACK.id).toBe("techone-financeone-native");
  });

  it("every CRITICAL rule cites a UCISA benchmark for traceability", () => {
    const criticals = TECHONE_FIN1_NATIVE_RULES.filter((r) => r.severity === "CRITICAL");
    expect(criticals.length).toBeGreaterThan(0);
    for (const r of criticals) {
      expect(r.ucisa_benchmark_ref).toMatch(/^UCISA-/);
    }
  });
});
