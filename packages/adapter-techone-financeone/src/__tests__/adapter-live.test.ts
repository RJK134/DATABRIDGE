/**
 * Adapter behaviour when the live HTTP path is engaged.
 *
 * Strategy: inject a fake `httpClientFactory` that returns a stub
 * client with a deterministic `get` / `paginate`. We don't go through
 * the real {@link TechOneConnectClient} here — its behaviour is
 * covered in http.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { TechOneFinanceOneAdapter } from "../adapter.js";
import type { TechOneConnectClient, ConnectListResponse } from "../http.js";

const CONFIG = {
  tenantUrl: "https://customer.techoneglobal.com",
  clientId: "databridge-client",
  clientSecretKey: "t1-connect-secret",
};

function makeLiveCtx() {
  return {
    tenantId: "test-tenant",
    connectionId: "test-conn",
    // Returning a non-empty secret engages the live HTTP path.
    secrets: { get: vi.fn(async () => "vault-resolved-secret") },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    signal: new AbortController().signal,
  };
}

/**
 * Build a fake client that captures `get` / `paginate` calls and
 * returns scripted responses. Casts through unknown because we only
 * implement the surface the adapter actually calls.
 */
function makeFakeClient(scripts: {
  get?: (path: string, query?: Record<string, unknown>) => unknown;
  pages?: ConnectListResponse[];
}): {
  client: TechOneConnectClient;
  calls: { get: { path: string; query?: Record<string, unknown> }[] };
} {
  const calls = { get: [] as { path: string; query?: Record<string, unknown> }[] };
  const stub = {
    async get(opts: { path: string; query?: Record<string, unknown> }) {
      const call: { path: string; query?: Record<string, unknown> } = { path: opts.path };
      if (opts.query !== undefined) call.query = opts.query;
      calls.get.push(call);
      if (scripts.get) return scripts.get(opts.path, opts.query);
      throw new Error(`fake client: no script for ${opts.path}`);
    },
    async *paginate() {
      for (const p of scripts.pages ?? []) yield p;
    },
  };
  return { client: stub as unknown as TechOneConnectClient, calls };
}

describe("TechOneFinanceOneAdapter — live HTTP path (via injected client)", () => {
  it("healthCheck hits /connect/api/v1/metadata/health and reports live mode", async () => {
    const { client, calls } = makeFakeClient({ get: () => ({ status: "ok" }) });
    const adapter = new TechOneFinanceOneAdapter(CONFIG, {
      httpClientFactory: () => client,
    });
    const res = await adapter.healthCheck(makeLiveCtx());
    expect(res.healthy).toBe(true);
    expect(res.details).toMatchObject({ mode: "live" });
    expect(calls.get[0]?.path).toBe("metadata/health");
  });

  it("healthCheck reports unhealthy when Connect raises", async () => {
    const { client } = makeFakeClient({
      get: () => {
        throw new Error("connection refused");
      },
    });
    const adapter = new TechOneFinanceOneAdapter(CONFIG, {
      httpClientFactory: () => client,
    });
    const res = await adapter.healthCheck(makeLiveCtx());
    expect(res.healthy).toBe(false);
    expect(res.message).toMatch(/connection refused/);
  });

  it("sampleTable maps Customers → /financials/ar/customers and trims to limit", async () => {
    const { client, calls } = makeFakeClient({
      get: () => ({
        data: [
          { CustomerCode: "C1", CustomerName: "One" },
          { CustomerCode: "C2", CustomerName: "Two" },
          { CustomerCode: "C3", CustomerName: "Three" },
        ],
        pageNumber: 1,
        pageSize: 3,
        totalRecords: 3,
      }),
    });
    const adapter = new TechOneFinanceOneAdapter(CONFIG, {
      httpClientFactory: () => client,
    });
    const rows = await adapter.sampleTable(makeLiveCtx(), {
      resource: "Customers",
      limit: 2,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.["CustomerCode"]).toBe("C1");
    expect(calls.get[0]?.path).toBe("financials/ar/customers");
    expect(calls.get[0]?.query).toMatchObject({ pageNumber: 1, ledgerEntity: "01" });
  });

  it("streamRows iterates paginated results and reports totalRows", async () => {
    const { client } = makeFakeClient({
      pages: [
        {
          data: [{ TransactionId: "T1" }, { TransactionId: "T2" }],
          pageNumber: 1,
          pageSize: 2,
          totalRecords: 3,
        },
        {
          data: [{ TransactionId: "T3" }],
          pageNumber: 2,
          pageSize: 2,
          totalRecords: 3,
        },
      ],
    });
    const adapter = new TechOneFinanceOneAdapter(CONFIG, {
      httpClientFactory: () => client,
    });
    const collected: string[] = [];
    let lastTotal = 0;
    for await (const page of adapter.streamRows(makeLiveCtx(), { resource: "Invoices" })) {
      lastTotal = page.totalRows ?? lastTotal;
      for (const r of page.rows) collected.push(String(r["TransactionId"]));
    }
    expect(collected).toEqual(["T1", "T2", "T3"]);
    expect(lastTotal).toBe(3);
  });

  it("getRecordById builds a path with the encoded id and returns the row", async () => {
    const { client, calls } = makeFakeClient({
      get: () => ({ TransactionId: "T-1/2", Amount: 1500.5 }),
    });
    const adapter = new TechOneFinanceOneAdapter(CONFIG, {
      httpClientFactory: () => client,
    });
    const rec = await adapter.getRecordById(makeLiveCtx(), {
      resource: "Invoices",
      id: "T-1/2",
    });
    expect(rec).toMatchObject({ TransactionId: "T-1/2", Amount: 1500.5 });
    expect(calls.get[0]?.path).toBe("financials/ar/invoices/T-1%2F2");
  });

  it("getRecordById returns null on 404 and rethrows other errors", async () => {
    const adapter404 = new TechOneFinanceOneAdapter(CONFIG, {
      httpClientFactory: () =>
        makeFakeClient({
          get: () => {
            throw new Error("techone-connect: 404 Not Found on /x");
          },
        }).client,
    });
    await expect(
      adapter404.getRecordById(makeLiveCtx(), { resource: "Invoices", id: "missing" })
    ).resolves.toBeNull();

    const adapter500 = new TechOneFinanceOneAdapter(CONFIG, {
      httpClientFactory: () =>
        makeFakeClient({
          get: () => {
            throw new Error("kaboom");
          },
        }).client,
    });
    await expect(
      adapter500.getRecordById(makeLiveCtx(), { resource: "Invoices", id: "x" })
    ).rejects.toThrow(/kaboom/);
  });

  it("falls back to the stub path if the secrets accessor throws", async () => {
    const ctx = makeLiveCtx();
    ctx.secrets.get = vi.fn(async (): Promise<string> => {
      throw new Error("vault unavailable");
    });
    const adapter = new TechOneFinanceOneAdapter(CONFIG, {
      httpClientFactory: () => {
        throw new Error("httpClientFactory should not be called in fallback");
      },
    });
    const res = await adapter.healthCheck(ctx);
    expect(res.healthy).toBe(true);
    expect(res.details).toMatchObject({ mode: "stub" });
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it("primaryKeyFor exposes the canonical PK for downstream consumers", () => {
    expect(TechOneFinanceOneAdapter.primaryKeyFor("Invoices")).toBe("TransactionId");
    expect(TechOneFinanceOneAdapter.primaryKeyFor("Customers")).toBe("CustomerCode");
    expect(TechOneFinanceOneAdapter.primaryKeyFor("GlPostings")).toBe("GlTransactionId");
  });
});
