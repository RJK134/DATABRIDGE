import { describe, it, expect } from "vitest";
import { rules } from "../index.js";

describe("profile-sits rules", () => {
  it("exports at least 40 rules", () => {
    // Phase A target: ≥40 rules. Will increase to 60+ once F08–F13 family
    // rules land (tracked in profile-sits backlog).
    expect(rules.length).toBeGreaterThanOrEqual(40);
  });

  it("all rules have required fields", () => {
    for (const rule of rules) {
      expect(rule.id, `${rule.id} missing id`).toBeTruthy();
      expect(rule.family, `${rule.id} missing family`).toBeTruthy();
      expect(rule.name, `${rule.id} missing name`).toBeTruthy();
      expect(rule.severity, `${rule.id} missing severity`).toBeTruthy();
      expect(rule.type, `${rule.id} missing type`).toBeTruthy();
    }
  });

  it("all rules have ucisa_benchmark_ref", () => {
    for (const rule of rules) {
      expect(rule.ucisa_benchmark_ref, `${rule.id} missing ucisa_benchmark_ref`).toBeTruthy();
    }
  });

  it("all SQL rules have messageTemplate", () => {
    for (const rule of rules) {
      if (rule.type === "sql") {
        expect(rule.messageTemplate, `${rule.id} missing messageTemplate`).toBeTruthy();
      }
    }
  });

  it("no duplicate rule ids", () => {
    const ids = rules.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("legacy scar rules LS-01 to LS-08 all present", () => {
    const legacyScarIds = ["LS-01", "LS-02", "LS-03", "LS-04", "LS-05", "LS-06", "LS-07", "LS-08"];
    for (const id of legacyScarIds) {
      expect(
        rules.find((r) => r.id === id),
        `Missing legacy scar rule ${id}`
      ).toBeTruthy();
    }
  });

  it("all legacy scar rules are in family F13", () => {
    const legacyScars = rules.filter((r) => r.id.startsWith("LS-"));
    for (const rule of legacyScars) {
      expect(rule.family).toBe("F13");
    }
  });
});
