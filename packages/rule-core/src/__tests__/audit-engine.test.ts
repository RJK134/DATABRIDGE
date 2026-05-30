/**
 * AuditEngine tests
 *
 * Exercises the orchestrator with a fake SqlExecutor and a fake SourceAdapter
 * so we don't need a real database or network. Verifies:
 *   - SQL-only rules path
 *   - Fn-only rules path (rows streamed from adapter)
 *   - Mixed rule list produces one combined report
 *   - tenantId stamping on Fn findings (Fn runner leaves it "")
 *   - rule partitioning correctness
 *   - subjectId fallback chain (PK map → id → subject_id → synthetic)
 *   - warnings when Fn rules are present without a source
 */

import { describe, expect, it } from "vitest";

import type {
  SourceAdapter,
  AdapterContext,
  StreamRowsArgs,
  StreamRowsPage,
  SampledRow,
} from "@databridge/adapter-spec";

import { AuditEngine } from "../audit-engine.js";
import type { AuditRule, FnAuditRule, RuleEvalContext } from "../types.js";
import type { SqlExecutor, FieldStats } from "../engine.js";

/* ------------------------------ fake SqlExecutor -------------------------- */

class FakeSqlExecutor implements SqlExecutor {
  public sqlCalls: Array<{ sql: string; params: Record<string, unknown> }> = [];
  constructor(private readonly rows: Record<string, unknown>[] = []) {}
  async query(sql: string, params: { tenantId: string } & Record<string, unknown>) {
    this.sqlCalls.push({ sql, params });
    return this.rows;
  }
  async queryCodelistViolations() {
    return [];
  }
  async queryFieldStats(): Promise<FieldStats> {
    return { nullPct: 0, cardinality: 0, topValues: [] };
  }
}

/* ----------------------------- fake SourceAdapter ------------------------- */

function makeFakeSource(byResource: Record<string, SampledRow[]>): SourceAdapter {
  return {
    id: "fake",
    displayName: "Fake",
    capabilities: {
      supportsIncremental: false,
      supportsDictionary: false,
      supportsSampling: true,
      supportsCodeLists: false,
      preferredAuth: "file",
    },
    async healthCheck() {
      return { healthy: true, latencyMs: 0 };
    },
    async discoverSchema() {
      return {
        adapter: "fake",
        generatedAt: new Date().toISOString(),
        resources: [],
      };
    },
    async sampleTable() {
      return [];
    },
    async *streamRows(_ctx: AdapterContext, args: StreamRowsArgs): AsyncIterable<StreamRowsPage> {
      const rows = byResource[args.resource] ?? [];
      yield { rows, totalRows: rows.length };
    },
    async getCodeLists() {
      return [];
    },
    async getDictionary() {
      return [];
    },
    async getRecordById() {
      return null;
    },
  };
}

function makeAdapterCtx(): AdapterContext {
  return {
    tenantId: "t1",
    connectionId: "c1",
    secrets: {
      async get() {
        return "";
      },
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
    signal: new AbortController().signal,
  };
}

function makeRuleCtx(): RuleEvalContext {
  return {
    tenantId: "t1",
    connectionId: "c1",
    codeLists: new Map(),
    signal: new AbortController().signal,
  };
}

/* ----------------------------- SQL-only path ------------------------------ */

describe("AuditEngine — SQL rules only", () => {
  it("runs SQL rules and stamps tenantId on findings", async () => {
    const sqlRule: AuditRule = {
      id: "F01-S1",
      name: "missing-id",
      severity: "ERROR",
      family: "F01",
      type: "sql",
      description: "rows missing id",
      enabledByDefault: true,
      sql: "SELECT subject_id FROM stu WHERE tenant = :tenantId",
      messageTemplate: "row {{subject_id}} missing id",
    };
    const exec = new FakeSqlExecutor([{ subject_id: "s1" }, { subject_id: "s2" }]);
    const engine = new AuditEngine(exec);

    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [sqlRule],
      resourceMap: {},
      ctx: makeRuleCtx(),
    });

    expect(report.rulesSql).toBe(1);
    expect(report.rulesFn).toBe(0);
    expect(report.findingsTotal).toBe(2);
    expect(report.findings.every((f) => f.tenantId === "t1")).toBe(true);
    expect(report.sqlSummary?.rulesEvaluated).toBe(1);
  });
});

/* ------------------------------ Fn-only path ------------------------------ */

describe("AuditEngine — Fn rules only", () => {
  it("streams rows from source and runs Fn rules", async () => {
    const fnRule: FnAuditRule = {
      id: "H01-1",
      family: "CODING",
      severity: "ERROR",
      entity: "Student",
      field: "code",
      description: "code must be A",
      evaluate: ({ value }: { value: unknown }) =>
        value === "A" ? { pass: true } : { pass: false, message: "bad" },
    };
    const source = makeFakeSource({
      STU: [
        { id: "s1", code: "A" },
        { id: "s2", code: "B" },
        { id: "s3", code: "C" },
      ],
    });
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [fnRule],
      resourceMap: { STU: "Student" },
      primaryKeyMap: { STU: "id" },
      source,
      adapterCtx: makeAdapterCtx(),
      ctx: makeRuleCtx(),
    });

    expect(report.rowsScanned).toBe(3);
    expect(report.findingsTotal).toBe(2);
    expect(report.findings.map((f) => f.subjectId).sort()).toEqual(["s2", "s3"]);
    expect(report.findings.every((f) => f.tenantId === "t1")).toBe(true);
    expect(report.fnSummary?.rowsProcessed).toBe(3);
  });

  it("uses subjectId fallback chain when no PK map provided", async () => {
    const fnRule: FnAuditRule = {
      id: "X-1",
      family: "X",
      severity: "WARN",
      entity: "Student",
      description: "always fail",
      evaluate: () => ({ pass: false, message: "f" }),
    };
    // No 'id'/'subject_id'/'pk' columns → falls back to synthetic id.
    const source = makeFakeSource({ STU: [{ code: "X" }, { code: "Y" }] });
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [fnRule],
      resourceMap: { STU: "Student" },
      source,
      adapterCtx: makeAdapterCtx(),
      ctx: makeRuleCtx(),
    });
    expect(report.findings.map((f) => f.subjectId)).toEqual(["STU:0", "STU:1"]);
  });
});

/* ------------------------------- mixed path ------------------------------- */

describe("AuditEngine — mixed SQL + Fn rules", () => {
  it("runs both runners and aggregates", async () => {
    const sqlRule: AuditRule = {
      id: "S-1",
      name: "s1",
      severity: "ERROR",
      family: "F01",
      type: "sql",
      description: "s1",
      enabledByDefault: true,
      sql: "SELECT subject_id FROM stu WHERE 1=1",
      messageTemplate: "{{subject_id}}",
    };
    const fnRule: FnAuditRule = {
      id: "F-1",
      family: "CODING",
      severity: "WARN",
      entity: "Student",
      description: "code A only",
      evaluate: ({ value }: { value: unknown }) =>
        value === "A" ? { pass: true } : { pass: false, message: "x" },
      field: "code",
    };
    const exec = new FakeSqlExecutor([{ subject_id: "sql1" }]);
    const source = makeFakeSource({
      STU: [
        { id: "s1", code: "A" },
        { id: "s2", code: "B" },
      ],
    });

    const engine = new AuditEngine(exec);
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [sqlRule, fnRule],
      resourceMap: { STU: "Student" },
      primaryKeyMap: { STU: "id" },
      source,
      adapterCtx: makeAdapterCtx(),
      ctx: makeRuleCtx(),
    });

    expect(report.rulesTotal).toBe(2);
    expect(report.rulesSql).toBe(1);
    expect(report.rulesFn).toBe(1);
    expect(report.findingsTotal).toBe(2); // 1 SQL + 1 Fn
    expect(report.findingsBySeverity["ERROR"]).toBe(1);
    expect(report.findingsBySeverity["WARN"]).toBe(1);
    expect(report.sqlSummary).toBeDefined();
    expect(report.fnSummary).toBeDefined();
  });

  it("warns when Fn rules are present without a source", async () => {
    const fnRule: FnAuditRule = {
      id: "F-1",
      family: "X",
      severity: "ERROR",
      entity: "Student",
      description: "x",
      evaluate: () => ({ pass: true }),
    };
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [fnRule],
      resourceMap: { STU: "Student" },
      ctx: makeRuleCtx(),
    });
    expect(report.findingsTotal).toBe(0);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toMatch(/Fn rule\(s\) but no source/);
  });
});

/* ------------------------------ auditId / metadata ------------------------ */

describe("AuditEngine — report metadata", () => {
  it("generates auditId when not supplied and emits ISO timestamps", async () => {
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [],
      resourceMap: {},
      ctx: makeRuleCtx(),
    });
    expect(report.auditId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(report.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("honours a caller-supplied auditId", async () => {
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      auditId: "audit-123",
      tenantId: "t1",
      rules: [],
      resourceMap: {},
      ctx: makeRuleCtx(),
    });
    expect(report.auditId).toBe("audit-123");
  });
});

/* ------------------------- E3 streaming / concurrency --------------------- */

/**
 * A paged source that yields rows in chunks via nextCursor so we can verify
 * the engine truly streams (rather than waiting for one big page).
 */
function makePagedSource(
  pagesByResource: Record<string, SampledRow[][]>,
  pageDelayMs = 0
): SourceAdapter {
  return {
    id: "paged",
    displayName: "Paged",
    capabilities: {
      supportsIncremental: false,
      supportsDictionary: false,
      supportsSampling: true,
      supportsCodeLists: false,
      preferredAuth: "file",
    },
    async healthCheck() {
      return { healthy: true, latencyMs: 0 };
    },
    async discoverSchema() {
      return {
        adapter: "paged",
        generatedAt: new Date().toISOString(),
        resources: [],
      };
    },
    async sampleTable() {
      return [];
    },
    async *streamRows(_ctx: AdapterContext, args: StreamRowsArgs): AsyncIterable<StreamRowsPage> {
      const pages = pagesByResource[args.resource] ?? [];
      const idx = args.cursor ? Number(args.cursor) : 0;
      if (idx >= pages.length) return;
      if (pageDelayMs > 0) await new Promise((r) => setTimeout(r, pageDelayMs));
      const next = idx + 1;
      const page: StreamRowsPage = {
        rows: pages[idx] ?? [],
        ...(next < pages.length ? { nextCursor: String(next) } : {}),
      };
      yield page;
    },
    async getCodeLists() {
      return [];
    },
    async getDictionary() {
      return [];
    },
    async getRecordById() {
      return null;
    },
  };
}

describe("AuditEngine \u2014 E3 streaming", () => {
  it("streams rows page-by-page across multiple cursors", async () => {
    const fnRule: FnAuditRule = {
      id: "P-1",
      family: "X",
      severity: "WARN",
      entity: "Student",
      field: "code",
      description: "flag B",
      evaluate: ({ value }: { value: unknown }) =>
        value === "B" ? { pass: false, message: "b" } : { pass: true },
    };
    const source = makePagedSource({
      STU: [
        [
          { id: "a", code: "A" },
          { id: "b", code: "B" },
        ],
        [
          { id: "c", code: "A" },
          { id: "d", code: "B" },
        ],
        [{ id: "e", code: "A" }],
      ],
    });
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [fnRule],
      resourceMap: { STU: "Student" },
      primaryKeyMap: { STU: "id" },
      source,
      adapterCtx: makeAdapterCtx(),
      ctx: makeRuleCtx(),
    });
    expect(report.rowsScanned).toBe(5);
    expect(report.findings.map((f) => f.subjectId).sort()).toEqual(["b", "d"]);
  });

  it("streams multiple resources sequentially by default", async () => {
    const fnRule: FnAuditRule = {
      id: "M-1",
      family: "X",
      severity: "WARN",
      description: "always fail",
      evaluate: () => ({ pass: false, message: "x" }),
    };
    const source = makePagedSource({
      STU: [[{ id: "s1" }, { id: "s2" }]],
      ENG: [[{ id: "e1" }]],
    });
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [fnRule],
      resourceMap: { STU: "Student", ENG: "Engagement" },
      primaryKeyMap: { STU: "id", ENG: "id" },
      source,
      adapterCtx: makeAdapterCtx(),
      ctx: makeRuleCtx(),
    });
    expect(report.rowsScanned).toBe(3);
    expect(report.findings.map((f) => f.subjectId).sort()).toEqual(["e1", "s1", "s2"]);
    // findings carry the right entity
    const entities = new Set(report.findings.map((f) => f.entityType));
    expect(entities).toEqual(new Set(["Student", "Engagement"]));
  });

  it("runs resources in parallel when resourceConcurrency > 1", async () => {
    const fnRule: FnAuditRule = {
      id: "C-1",
      family: "X",
      severity: "WARN",
      description: "always fail",
      evaluate: () => ({ pass: false, message: "x" }),
    };
    // 20ms delay per page so parallel must be substantially faster than serial.
    const pages: SampledRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
    }));
    const source = makePagedSource({ A: [pages], B: [pages], C: [pages] }, 20);
    const serialEngine = new AuditEngine(new FakeSqlExecutor());
    const parallelEngine = new AuditEngine(new FakeSqlExecutor(), {
      resourceConcurrency: 3,
    });
    const args = {
      tenantId: "t1",
      rules: [fnRule],
      resourceMap: { A: "E1", B: "E2", C: "E3" },
      primaryKeyMap: { A: "id", B: "id", C: "id" },
      source,
      adapterCtx: makeAdapterCtx(),
      ctx: makeRuleCtx(),
    };
    const t0 = Date.now();
    const serial = await serialEngine.runAudit(args);
    const tSerial = Date.now() - t0;
    const t1 = Date.now();
    const parallel = await parallelEngine.runAudit(args);
    const tParallel = Date.now() - t1;

    expect(serial.rowsScanned).toBe(30);
    expect(parallel.rowsScanned).toBe(30);
    expect(parallel.findingsTotal).toBe(30);
    // Parallel should not be slower than serial. Don't make the bound too
    // tight \u2014 CI is noisy. Serial does ~3\u00d720ms = 60ms, parallel ~20ms.
    expect(tParallel).toBeLessThan(tSerial);
  });

  it("honours adapterCtx.signal during streaming", async () => {
    const seenRows: string[] = [];
    const fnRule: FnAuditRule = {
      id: "AB-1",
      family: "X",
      severity: "WARN",
      description: "log + pass",
      evaluate: ({ record }: { record: Record<string, unknown> }) => {
        seenRows.push(String(record["id"]));
        return { pass: true };
      },
    };
    // 20ms-per-page source so the abort timer can fire mid-stream.
    const source = makePagedSource(
      {
        STU: [[{ id: "p1a" }, { id: "p1b" }], [{ id: "p2a" }, { id: "p2b" }], [{ id: "p3a" }]],
      },
      20
    );
    const ac = new AbortController();
    const adapterCtx: AdapterContext = {
      ...makeAdapterCtx(),
      signal: ac.signal,
    };
    // Abort after the first page has been delivered (~25ms in).
    setTimeout(() => ac.abort(), 25);
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [fnRule],
      resourceMap: { STU: "Student" },
      primaryKeyMap: { STU: "id" },
      source,
      adapterCtx,
      ctx: makeRuleCtx(),
    });
    // Should not have processed every row \u2014 abort bounded the scan.
    expect(report.rowsScanned).toBeLessThan(5);
  });
});
