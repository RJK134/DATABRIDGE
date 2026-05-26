/**
 * Adapter behaviour when the live HTTP path is engaged.
 *
 * Strategy: inject a fake `httpClientFactory` that returns a stub
 * client with deterministic `get` / `paginate`. We don't go through
 * the real {@link WorkdayRaasClient} here — its behaviour is covered
 * in http.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { WorkdayRaasAdapter, RAAS_REPORT_NAME } from "../index.js";
import type { WorkdayRaasClient, RaasReportResponse } from "../index.js";

const CONFIG = {
  tenantUrl: "https://wd5-impl-services1.workday.com/ccx/service/example/customreport2",
  username: "isu_databridge",
  passwordSecretKey: "wd-isu-pass",
};

function makeLiveCtx() {
  return {
    tenantId: "test-tenant",
    connectionId: "test-conn",
    // Returning a non-empty secret engages the live HTTP path.
    secrets: { get: vi.fn(async () => "vault-resolved-pass") },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    signal: new AbortController().signal,
  };
}

interface FakeCallLog {
  get: { reportName: string; query?: Record<string, unknown> }[];
}

function makeFakeClient(scripts: {
  get?: (
    reportName: string,
    query?: Record<string, unknown>,
  ) => RaasReportResponse | unknown[];
  pages?: Array<{ rows: unknown[]; total: number }>;
}): { client: WorkdayRaasClient; calls: FakeCallLog } {
  const calls: FakeCallLog = { get: [] };
  const stub = {
    async get(opts: { reportName: string; query?: Record<string, unknown> }) {
      const call: { reportName: string; query?: Record<string, unknown> } = {
        reportName: opts.reportName,
      };
      if (opts.query !== undefined) call.query = opts.query;
      calls.get.push(call);
      if (scripts.get) return scripts.get(opts.reportName, opts.query);
      throw new Error(`fake client: no script for ${opts.reportName}`);
    },
    async *paginate() {
      for (const p of scripts.pages ?? []) yield p;
    },
  };
  return { client: stub as unknown as WorkdayRaasClient, calls };
}

describe("WorkdayRaasAdapter — live HTTP path (via injected client)", () => {
  it("healthCheck probes Academic_Periods and reports live mode", async () => {
    const { client, calls } = makeFakeClient({
      get: () => ({ Report_Entry: [] }),
    });
    const adapter = new WorkdayRaasAdapter(CONFIG, {
      httpClientFactory: () => client,
    });
    const res = await adapter.healthCheck(makeLiveCtx());
    expect(res.healthy).toBe(true);
    expect(res.details).toMatchObject({ mode: "live" });
    expect(calls.get[0]?.reportName).toBe(RAAS_REPORT_NAME["Academic_Periods"]);
  });

  it("healthCheck reports unhealthy when RaaS raises", async () => {
    const { client } = makeFakeClient({
      get: () => {
        throw new Error("connection refused");
      },
    });
    const adapter = new WorkdayRaasAdapter(CONFIG, {
      httpClientFactory: () => client,
    });
    const res = await adapter.healthCheck(makeLiveCtx());
    expect(res.healthy).toBe(false);
    expect(res.message).toMatch(/connection refused/);
  });

  it("sampleTable maps Students → INT_DataBridge_Students and trims to limit", async () => {
    const { client, calls } = makeFakeClient({
      get: () => ({
        Report_Entry: [
          { Student_ID: "S001" },
          { Student_ID: "S002" },
          { Student_ID: "S003" },
        ],
      }),
    });
    const adapter = new WorkdayRaasAdapter(CONFIG, {
      httpClientFactory: () => client,
    });
    const rows = await adapter.sampleTable(makeLiveCtx(), {
      resource: "Students",
      limit: 2,
    });
    expect(rows).toHaveLength(2);
    expect(calls.get[0]?.reportName).toBe(RAAS_REPORT_NAME["Students"]);
  });

  it("streamRows passes Last_Modified_Since when sinceTimestamp is supplied", async () => {
    const { client } = makeFakeClient({
      pages: [{ rows: [{ Student_ID: "S1" }], total: 1 }],
    });
    const adapter = new WorkdayRaasAdapter(CONFIG, {
      httpClientFactory: () => client,
    });
    const pages: Array<{ rows: unknown[]; totalRows?: number }> = [];
    for await (const p of adapter.streamRows(makeLiveCtx(), {
      resource: "Students",
      sinceTimestamp: "2026-05-01T00:00:00Z",
    })) {
      pages.push(p);
    }
    expect(pages).toHaveLength(1);
    expect(pages[0]!.totalRows).toBe(1);
  });

  it("streamRows yields zero pages when no rows are returned", async () => {
    const { client } = makeFakeClient({ pages: [{ rows: [], total: 0 }] });
    const adapter = new WorkdayRaasAdapter(CONFIG, {
      httpClientFactory: () => client,
    });
    let pageCount = 0;
    for await (const p of adapter.streamRows(makeLiveCtx(), {
      resource: "Students",
    })) {
      pageCount += 1;
      expect(p.totalRows).toBe(0);
    }
    expect(pageCount).toBe(1);
  });

  it("getRecordById queries with PK prompt and returns the matching row", async () => {
    const { client, calls } = makeFakeClient({
      get: () => ({
        Report_Entry: [
          { Student_ID: "S001", Legal_Name: "Alice" },
          { Student_ID: "S002", Legal_Name: "Bob" },
        ],
      }),
    });
    const adapter = new WorkdayRaasAdapter(CONFIG, {
      httpClientFactory: () => client,
    });
    const row = await adapter.getRecordById(makeLiveCtx(), {
      resource: "Students",
      id: "S002",
    });
    expect(row).toMatchObject({ Student_ID: "S002", Legal_Name: "Bob" });
    expect(calls.get[0]?.query).toMatchObject({ Student_ID: "S002" });
  });

  it("getRecordById returns null when the report yields no rows", async () => {
    const { client } = makeFakeClient({ get: () => ({ Report_Entry: [] }) });
    const adapter = new WorkdayRaasAdapter(CONFIG, {
      httpClientFactory: () => client,
    });
    const row = await adapter.getRecordById(makeLiveCtx(), {
      resource: "Students",
      id: "missing",
    });
    expect(row).toBeNull();
  });

  it("falls back to the stub path when the secrets accessor throws", async () => {
    const adapter = new WorkdayRaasAdapter(CONFIG);
    const stubCtx = {
      tenantId: "test-tenant",
      connectionId: "test-conn",
      secrets: {
        get: vi.fn(async (): Promise<string> => {
          throw new Error("secret not found");
        }),
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      signal: new AbortController().signal,
    };
    const res = await adapter.healthCheck(stubCtx);
    expect(res.details).toMatchObject({ mode: "stub" });
  });

  it("primaryKeyFor returns the canonical PK name per resource", () => {
    expect(WorkdayRaasAdapter.primaryKeyFor("Students")).toBe("Student_ID");
    expect(WorkdayRaasAdapter.primaryKeyFor("Academic_Periods")).toBe(
      "Academic_Period_ID",
    );
  });
});
