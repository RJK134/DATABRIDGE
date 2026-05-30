import { describe, expect, it } from "vitest";
import type { AuditFinding, RuleSeverity } from "@databridge/rule-core";
import {
  aggregateSeverityBySurface,
  classifySurface,
  reportToMd,
  SEVERITIES,
  SURFACES,
} from "../index.js";

function f(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: "t-1",
    ruleId: "rule-x",
    ruleName: "Rule X",
    severity: "ERROR",
    entityType: "Student",
    subjectId: "s-1",
    message: "broken",
    evidence: {},
    status: "open",
    detectedAt: "2026-05-26T18:00:00.000Z",
    ...overrides,
  };
}

describe("classifySurface — direct map", () => {
  const cases: Array<[string, string]> = [
    ["Student", "enrolments"],
    ["Application", "admissions"],
    ["Mark", "results"],
    ["Award", "awards"],
    ["Fee", "finance"],
    ["Programme", "programmes"],
    ["CAS", "visa"],
  ];
  for (const [entity, surface] of cases) {
    it(`maps ${entity} → ${surface}`, () => {
      expect(classifySurface(f({ entityType: entity }))).toBe(surface);
    });
  }
});

describe("classifySurface — pattern fallback", () => {
  it("falls back via ruleId tokens", () => {
    expect(classifySurface(f({ entityType: "Codeset", ruleId: "fee-band-missing" }))).toBe(
      "finance"
    );
  });
  it("falls back via ruleName tokens", () => {
    expect(
      classifySurface(f({ entityType: "Lookup", ruleId: "x", ruleName: "VISA expired CAS" }))
    ).toBe("visa");
  });
  it("returns other when nothing matches", () => {
    expect(classifySurface(f({ entityType: "MysteryEntity", ruleId: "x", ruleName: "y" }))).toBe(
      "other"
    );
  });
});

describe("aggregateSeverityBySurface", () => {
  it("counts by surface × severity", () => {
    const findings = [
      f({ entityType: "Student", severity: "ERROR" }),
      f({ entityType: "Student", severity: "WARN" }),
      f({ entityType: "Mark", severity: "CRITICAL" }),
      f({ entityType: "Fee", severity: "INFO" }),
      f({ entityType: "Award", severity: "ERROR" }),
    ];
    const report = aggregateSeverityBySurface(findings);
    expect(report.totals.findings).toBe(5);
    expect(report.totals.bySeverity.CRITICAL).toBe(1);
    expect(report.totals.bySeverity.ERROR).toBe(2);
    expect(report.totals.bySurface.enrolments).toBe(2);
    expect(report.totals.bySurface.results).toBe(1);
  });

  it("emits surface rollups with weights", () => {
    const report = aggregateSeverityBySurface([
      f({ entityType: "Student", severity: "CRITICAL" }),
      f({ entityType: "Student", severity: "ERROR" }),
    ]);
    const enrol = report.surfaces.find((s) => s.surface === "enrolments")!;
    // CRITICAL=8 + ERROR=4 = 12
    expect(enrol.weight).toBe(12);
    expect(enrol.total).toBe(2);
  });

  it("cells only include non-zero counts", () => {
    const report = aggregateSeverityBySurface([f({ entityType: "Student", severity: "ERROR" })]);
    expect(report.cells).toHaveLength(1);
    expect(report.cells[0]).toMatchObject({
      surface: "enrolments",
      severity: "ERROR",
      count: 1,
    });
  });

  it("respects custom surfaceMap", () => {
    const report = aggregateSeverityBySurface([f({ entityType: "PetCount", severity: "WARN" })], {
      surfaceMap: { PetCount: "other" },
    });
    expect(report.totals.bySurface.other).toBe(1);
  });

  it("respects custom clock", () => {
    const report = aggregateSeverityBySurface([], { clock: () => "FIXED" });
    expect(report.computedAt).toBe("FIXED");
  });

  it("handles empty input cleanly", () => {
    const report = aggregateSeverityBySurface([]);
    expect(report.totals.findings).toBe(0);
    expect(report.surfaces.every((s) => s.total === 0)).toBe(true);
    expect(report.cells).toHaveLength(0);
  });

  it("classifies pattern-only matches correctly", () => {
    const report = aggregateSeverityBySurface([
      f({ entityType: "Generic", ruleId: "admission-decision-missing" }),
      f({ entityType: "Generic", ruleId: "module-credit-mismatch" }),
    ]);
    expect(report.totals.bySurface.admissions).toBe(1);
    expect(report.totals.bySurface.programmes).toBe(1);
  });
});

describe("reportToMd", () => {
  it("renders all severity columns", () => {
    const report = aggregateSeverityBySurface([f({ entityType: "Student", severity: "ERROR" })]);
    const md = reportToMd(report);
    for (const sev of SEVERITIES) {
      expect(md).toContain(sev);
    }
    expect(md).toContain("enrolments");
    expect(md).toContain("**total**");
  });

  it("skips zero-total surfaces", () => {
    const report = aggregateSeverityBySurface([f({ entityType: "Student", severity: "ERROR" })]);
    const md = reportToMd(report);
    // visa has zero findings, so it should NOT appear as its own row
    const lines = md.split("\n");
    const visaRow = lines.find((l) => l.startsWith("| visa "));
    expect(visaRow).toBeUndefined();
  });
});

describe("SURFACES + SEVERITIES exports", () => {
  it("exposes the canonical surface list", () => {
    expect(SURFACES).toContain("admissions");
    expect(SURFACES).toContain("other");
  });
  it("exposes the canonical severity list", () => {
    expect(SEVERITIES).toEqual<readonly RuleSeverity[]>(["CRITICAL", "ERROR", "WARN", "INFO"]);
  });
});
