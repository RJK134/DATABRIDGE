/**
 * FnRuleRunner tests.
 *
 * Exercises:
 *   - per-entity dispatch (rules only see rows for their declared entity)
 *   - universal rules (no entity) see every row
 *   - {value, record, context} input shape compatibility with all three
 *     destructure styles found in profile-hesa-tdp
 *   - findings carry severity, message, evidence, subjectId, entityType
 *   - "WARNING" alias normalises to "WARN"
 *   - maxFindingsPerRule and maxFindingsTotal caps mark summary.truncated
 *   - rules that throw produce findings (don't crash the run)
 *   - contextProvider pre-pass materialises rows for cross-record context
 *   - AbortSignal halts iteration
 */
import { describe, it, expect } from "vitest";
import {
  FnRuleRunner,
  normaliseSeverity,
  type EntityRow,
} from "../fn-runner.js";
import type { AuditFinding } from "../finding.js";
import type { FnAuditRule, RuleEvalContext } from "../types.js";

function makeCtx(signal?: AbortSignal): RuleEvalContext {
  return {
    tenantId: "t1",
    connectionId: "c1",
    codeLists: new Map(),
    signal: signal ?? new AbortController().signal,
  };
}

const passRule: FnAuditRule = {
  id: "PASS-1",
  family: "FORMAT",
  severity: "ERROR",
  description: "always passes",
  evaluate: () => ({ pass: true }),
};

const failRule = (id: string, entity?: string, field?: string): FnAuditRule => ({
  id,
  family: "FORMAT",
  severity: "ERROR",
  description: `${id} always fails`,
  ...(entity ? { entity } : {}),
  ...(field ? { field } : {}),
  evaluate: ({ value, record }: { value?: unknown; record?: Record<string, unknown> }) => ({
    pass: false,
    message: `failed for ${String(value ?? record?.["id"] ?? "?")}`,
  }),
});

describe("FnRuleRunner — basic dispatch", () => {
  it("returns clean summary when no rules fail", async () => {
    const rows: EntityRow[] = [
      { entity: "Student", subjectId: "s1", record: { id: "s1" } },
    ];
    const findings: AuditFinding[] = [];
    const runner = new FnRuleRunner();
    const sum = await runner.run([passRule], rows, makeCtx(), (f) => {
      findings.push(f);
    });
    expect(sum.findingsEmitted).toBe(0);
    expect(sum.rowsProcessed).toBe(1);
    expect(findings).toHaveLength(0);
  });

  it("partitions rules by entity — only matching entity sees the rule", async () => {
    const studentRule = failRule("S-1", "Student", "id");
    const engRule = failRule("E-1", "Engagement", "id");
    const rows: EntityRow[] = [
      { entity: "Student", subjectId: "s1", record: { id: "s1" } },
      { entity: "Engagement", subjectId: "e1", record: { id: "e1" } },
    ];
    const findings: AuditFinding[] = [];
    const sum = await new FnRuleRunner().run(
      [studentRule, engRule],
      rows,
      makeCtx(),
      (f) => { findings.push(f); },
    );
    expect(sum.findingsEmitted).toBe(2);
    expect(findings.map((f) => `${f.ruleId}:${f.entityType}`).sort()).toEqual([
      "E-1:Engagement",
      "S-1:Student",
    ]);
  });

  it("runs universal (no-entity) rules against every row", async () => {
    const universal: FnAuditRule = {
      id: "U-1",
      family: "FORMAT",
      severity: "WARN",
      description: "universal",
      evaluate: () => ({ pass: false, message: "no" }),
    };
    const rows: EntityRow[] = [
      { entity: "Student", subjectId: "s1", record: {} },
      { entity: "Engagement", subjectId: "e1", record: {} },
      { entity: "Leaver", subjectId: "l1", record: {} },
    ];
    const findings: AuditFinding[] = [];
    await new FnRuleRunner().run([universal], rows, makeCtx(), (f) => {
      findings.push(f);
    });
    expect(findings.map((f) => f.entityType).sort()).toEqual([
      "Engagement",
      "Leaver",
      "Student",
    ]);
  });
});

describe("FnRuleRunner — input shape compatibility", () => {
  it("supports rules that destructure {value}", async () => {
    const rule: FnAuditRule = {
      id: "V-1",
      family: "CODING",
      severity: "ERROR",
      entity: "Student",
      field: "code",
      description: "v-1",
      evaluate: ({ value }: { value: unknown }) =>
        value === "OK" ? { pass: true } : { pass: false, message: "bad code" },
    };
    const rows: EntityRow[] = [
      { entity: "Student", subjectId: "s1", record: { code: "OK" } },
      { entity: "Student", subjectId: "s2", record: { code: "X" } },
    ];
    const findings: AuditFinding[] = [];
    await new FnRuleRunner().run([rule], rows, makeCtx(), (f) => {
      findings.push(f);
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.subjectId).toBe("s2");
    expect(findings[0]?.evidence["value"]).toBe("X");
  });

  it("supports rules that destructure {record}", async () => {
    const rule: FnAuditRule = {
      id: "R-1",
      family: "TEMPORAL",
      severity: "ERROR",
      entity: "Course",
      description: "r-1",
      evaluate: ({ record }: { record: Record<string, unknown> }) => {
        const start = record["start"];
        const end = record["end"];
        if (start && end && String(end) < String(start)) {
          return { pass: false, message: "end before start" };
        }
        return { pass: true };
      },
    };
    const rows: EntityRow[] = [
      { entity: "Course", subjectId: "c1", record: { start: "2025", end: "2024" } },
      { entity: "Course", subjectId: "c2", record: { start: "2024", end: "2025" } },
    ];
    const findings: AuditFinding[] = [];
    await new FnRuleRunner().run([rule], rows, makeCtx(), (f) => {
      findings.push(f);
    });
    expect(findings.map((f) => f.subjectId)).toEqual(["c1"]);
  });

  it("supports rules that read {value, context}", async () => {
    const rule: FnAuditRule = {
      id: "X-1",
      family: "REFERENTIAL",
      severity: "ERROR",
      entity: "Engagement",
      field: "husid",
      description: "x-1",
      evaluate: ({
        value,
        context,
      }: {
        value: unknown;
        context: { studentHusids: Set<string> };
      }) => {
        if (!context.studentHusids.has(String(value))) {
          return { pass: false, message: "unknown husid" };
        }
        return { pass: true };
      },
    };
    const rows: EntityRow[] = [
      { entity: "Engagement", subjectId: "e1", record: { husid: "H1" } },
      { entity: "Engagement", subjectId: "e2", record: { husid: "H99" } },
    ];
    const findings: AuditFinding[] = [];
    await new FnRuleRunner({
      contextProvider: () => ({ studentHusids: new Set(["H1"]) }),
    }).run([rule], rows, makeCtx(), (f) => { findings.push(f); });
    expect(findings.map((f) => f.subjectId)).toEqual(["e2"]);
  });
});

describe("FnRuleRunner — severity normalisation", () => {
  it("normaliseSeverity collapses WARNING → WARN", () => {
    expect(normaliseSeverity("WARNING")).toBe("WARN");
    expect(normaliseSeverity("WARN")).toBe("WARN");
    expect(normaliseSeverity("ERROR")).toBe("ERROR");
    expect(normaliseSeverity("CRITICAL")).toBe("CRITICAL");
    expect(normaliseSeverity("INFO")).toBe("INFO");
  });

  it("emitted findings carry normalised severity", async () => {
    const rule: FnAuditRule = {
      id: "W-1",
      family: "FORMAT",
      severity: "WARNING", // alias
      entity: "Student",
      description: "warning rule",
      evaluate: () => ({ pass: false, message: "warn" }),
    };
    const findings: AuditFinding[] = [];
    await new FnRuleRunner().run(
      [rule],
      [{ entity: "Student", subjectId: "s1", record: {} }],
      makeCtx(),
      (f) => { findings.push(f); },
    );
    expect(findings[0]?.severity).toBe("WARN");
  });
});

describe("FnRuleRunner — caps and resilience", () => {
  it("honours maxFindingsPerRule and marks truncated", async () => {
    const rule = failRule("F-1", "Student", "id");
    const rows: EntityRow[] = Array.from({ length: 10 }, (_, i) => ({
      entity: "Student",
      subjectId: `s${i}`,
      record: { id: `s${i}` },
    }));
    const findings: AuditFinding[] = [];
    const sum = await new FnRuleRunner({ maxFindingsPerRule: 3 }).run(
      [rule],
      rows,
      makeCtx(),
      (f) => { findings.push(f); },
    );
    expect(findings).toHaveLength(3);
    expect(sum.truncated).toBe(true);
  });

  it("honours maxFindingsTotal across rules", async () => {
    const rules = [failRule("A", "Student"), failRule("B", "Student")];
    const rows: EntityRow[] = Array.from({ length: 5 }, (_, i) => ({
      entity: "Student",
      subjectId: `s${i}`,
      record: {},
    }));
    const findings: AuditFinding[] = [];
    const sum = await new FnRuleRunner({ maxFindingsTotal: 4 }).run(
      rules,
      rows,
      makeCtx(),
      (f) => { findings.push(f); },
    );
    expect(findings.length).toBeLessThanOrEqual(4);
    expect(sum.truncated).toBe(true);
  });

  it("captures rule throws as findings (does not crash)", async () => {
    const throwy: FnAuditRule = {
      id: "T-1",
      family: "FORMAT",
      severity: "ERROR",
      entity: "Student",
      description: "throws",
      evaluate: () => {
        throw new Error("kaboom");
      },
    };
    const findings: AuditFinding[] = [];
    const sum = await new FnRuleRunner().run(
      [throwy],
      [{ entity: "Student", subjectId: "s1", record: {} }],
      makeCtx(),
      (f) => { findings.push(f); },
    );
    expect(sum.findingsEmitted).toBe(1);
    expect(findings[0]?.message).toMatch(/kaboom/);
  });

  it("skips rules without an evaluate function", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad: FnAuditRule = {
      id: "BAD",
      family: "FORMAT",
      severity: "ERROR",
      description: "no evaluate",
    } as any;
    const sum = await new FnRuleRunner().run(
      [bad],
      [{ entity: "Student", subjectId: "s1", record: {} }],
      makeCtx(),
      () => undefined,
    );
    expect(sum.rulesSkipped).toBe(1);
    expect(sum.findingsEmitted).toBe(0);
  });

  it("respects AbortSignal — halts iteration mid-stream", async () => {
    const ctrl = new AbortController();
    const rule = failRule("F-1", "Student", "id");
    async function* rows(): AsyncGenerator<EntityRow> {
      yield { entity: "Student", subjectId: "s1", record: { id: "s1" } };
      ctrl.abort();
      yield { entity: "Student", subjectId: "s2", record: { id: "s2" } };
    }
    const findings: AuditFinding[] = [];
    const sum = await new FnRuleRunner().run(
      [rule],
      rows(),
      makeCtx(ctrl.signal),
      (f) => { findings.push(f); },
    );
    expect(sum.rowsProcessed).toBe(1);
    expect(findings).toHaveLength(1);
  });
});
