/**
 * CIA cube fallback tests — covers cubePathFor mapping, REST GET shape,
 * pagination, and the breaker controller (threshold trip, cooldown,
 * success-clears-count, manual reset).
 */
import { describe, it, expect, vi } from "vitest";
import {
  CiaCubeClient,
  CiaFallbackController,
  TechOneFinanceOneConfigSchema,
  type FetchLike,
} from "../index.js";

const CONFIG = TechOneFinanceOneConfigSchema.parse({
  tenantUrl: "https://customer.techoneglobal.com",
  clientId: "databridge-client",
  clientSecretKey: "t1-connect-secret",
  enableCiaFallback: true,
});

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function jsonRes(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  const status = init.status ?? 200;
  const headers = new Map(Object.entries(init.headers ?? {}));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : `HTTP ${status}`,
    headers: { get: (n: string) => headers.get(n.toLowerCase()) ?? headers.get(n) ?? null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  };
}

describe("CiaCubeClient.cubePathFor", () => {
  it("maps Connect AR/GL paths to their cube counterparts", () => {
    expect(CiaCubeClient.cubePathFor("financials/ar/customers")).toBe("customers");
    expect(CiaCubeClient.cubePathFor("financials/ar/invoices")).toBe("invoices");
    expect(CiaCubeClient.cubePathFor("financials/ar/receipts")).toBe("receipts");
    expect(CiaCubeClient.cubePathFor("financials/gl/postings")).toBe("gl_postings");
  });

  it("preserves trailing id segments (single-record GET)", () => {
    expect(CiaCubeClient.cubePathFor("financials/ar/customers/CUST-001")).toBe(
      "customers/CUST-001",
    );
  });

  it("returns undefined for paths not modelled in the cube", () => {
    expect(CiaCubeClient.cubePathFor("financials/ar/sponsors")).toBeUndefined();
    expect(CiaCubeClient.cubePathFor("workflow/instances")).toBeUndefined();
  });
});

describe("CiaCubeClient.get", () => {
  it("issues GET against /cia/cube/v1/<path> with bearer auth and returns parsed JSON", async () => {
    const fetchImpl: FetchLike = vi.fn(async (url, init) => {
      expect(url).toBe(
        "https://customer.techoneglobal.com/cia/cube/v1/customers?pageNumber=1&pageSize=500",
      );
      expect(init?.headers?.["authorization"]).toBe("Bearer cube-token");
      return jsonRes({ data: [{ CustomerCode: "C1" }], pageNumber: 1, pageSize: 500, totalRecords: 1 });
    });
    const client = new CiaCubeClient({
      config: CONFIG,
      bearerToken: "cube-token",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
    });
    const out = await client.get<{ data: unknown[] }>({
      path: "financials/ar/customers",
      query: { pageNumber: 1, pageSize: 500 },
    });
    expect(out.data).toHaveLength(1);
  });

  it("throws when the resource is not modelled in the cube", async () => {
    const client = new CiaCubeClient({
      config: CONFIG,
      bearerToken: "cube-token",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl: vi.fn(),
    });
    await expect(client.get({ path: "workflow/instances" })).rejects.toThrow(
      /not modelled in cube/,
    );
  });

  it("retries on 429/5xx and succeeds on later attempt", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = vi.fn(async () => {
      calls++;
      if (calls < 2) return jsonRes({}, { status: 503 });
      return jsonRes({ data: [], pageNumber: 1, pageSize: 500, totalRecords: 0 });
    });
    const client = new CiaCubeClient({
      config: CONFIG,
      bearerToken: "cube-token",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
      baseBackoffMs: 1,
    });
    await client.get({ path: "financials/ar/customers" });
    expect(calls).toBe(2);
  });

  it("paginate iterates until totalRecords are seen", async () => {
    const pages = [
      { data: [{ a: 1 }, { a: 2 }], pageNumber: 1, pageSize: 2, totalRecords: 5 },
      { data: [{ a: 3 }, { a: 4 }], pageNumber: 2, pageSize: 2, totalRecords: 5 },
      { data: [{ a: 5 }], pageNumber: 3, pageSize: 2, totalRecords: 5 },
    ];
    let i = 0;
    const fetchImpl: FetchLike = vi.fn(async () => jsonRes(pages[i++]!));
    const client = new CiaCubeClient({
      config: { ...CONFIG, pageSize: 2 },
      bearerToken: "tok",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
    });
    const seen: number[] = [];
    for await (const p of client.paginate<{ a: number }>({ path: "financials/ar/customers" })) {
      for (const row of p.data) seen.push(row.a);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("CiaFallbackController", () => {
  it("does not trip below threshold", () => {
    const ctrl = new CiaFallbackController({ threshold: 3, cooldownMs: 1000 });
    ctrl.recordRateLimit("Customers");
    ctrl.recordRateLimit("Customers");
    expect(ctrl.shouldFallback("Customers")).toBe(false);
  });

  it("trips at threshold and stays open until cooldown lapses", () => {
    let now = 1_000_000;
    const ctrl = new CiaFallbackController({
      threshold: 3,
      cooldownMs: 5_000,
      now: () => now,
    });
    ctrl.recordRateLimit("Customers");
    ctrl.recordRateLimit("Customers");
    ctrl.recordRateLimit("Customers");
    expect(ctrl.shouldFallback("Customers")).toBe(true);
    now += 4_999;
    expect(ctrl.shouldFallback("Customers")).toBe(true);
    now += 2;
    expect(ctrl.shouldFallback("Customers")).toBe(false);
  });

  it("recordSuccess clears the consecutive 429 count", () => {
    const ctrl = new CiaFallbackController({ threshold: 3, cooldownMs: 1000 });
    ctrl.recordRateLimit("Invoices");
    ctrl.recordRateLimit("Invoices");
    ctrl.recordSuccess("Invoices");
    ctrl.recordRateLimit("Invoices");
    ctrl.recordRateLimit("Invoices");
    expect(ctrl.shouldFallback("Invoices")).toBe(false);
    ctrl.recordRateLimit("Invoices");
    expect(ctrl.shouldFallback("Invoices")).toBe(true);
  });

  it("tracks per-resource state independently", () => {
    const ctrl = new CiaFallbackController({ threshold: 2, cooldownMs: 1000 });
    ctrl.recordRateLimit("Customers");
    ctrl.recordRateLimit("Customers");
    expect(ctrl.shouldFallback("Customers")).toBe(true);
    expect(ctrl.shouldFallback("Invoices")).toBe(false);
  });

  it("reset() clears state for a single resource or all", () => {
    let now = 1_000_000;
    const ctrl = new CiaFallbackController({
      threshold: 1,
      cooldownMs: 60_000,
      now: () => now,
    });
    ctrl.recordRateLimit("Customers");
    ctrl.recordRateLimit("Invoices");
    expect(ctrl.shouldFallback("Customers")).toBe(true);
    ctrl.reset("Customers");
    expect(ctrl.shouldFallback("Customers")).toBe(false);
    expect(ctrl.shouldFallback("Invoices")).toBe(true);
    ctrl.reset();
    expect(ctrl.shouldFallback("Invoices")).toBe(false);
  });

  it("snapshot exposes counts and openUntil for diagnostics", () => {
    let now = 1_000_000;
    const ctrl = new CiaFallbackController({
      threshold: 2,
      cooldownMs: 5_000,
      now: () => now,
    });
    ctrl.recordRateLimit("Customers");
    ctrl.recordRateLimit("Customers");
    const snap = ctrl.snapshot();
    expect(snap.counts["Customers"]).toBe(2);
    expect(snap.openUntil["Customers"]).toBe(1_005_000);
  });
});
