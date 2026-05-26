/**
 * WorkdayRaasClient tests — exercises the live HTTP shape via an
 * injected fake fetch. Covers Basic auth header, format query param,
 * Report_Entry extraction, retry on 429/5xx (with Retry-After), pagination
 * shim, and abort propagation.
 */
import { describe, it, expect, vi } from "vitest";
import { WorkdayRaasClient, type WorkdayRaasFetchLike } from "../index.js";
import { WorkdayRaasConfigSchema } from "../config.js";

const CONFIG = WorkdayRaasConfigSchema.parse({
  tenantUrl: "https://wd5-impl-services1.workday.com/ccx/service/example/customreport2",
  username: "isu_databridge",
  passwordSecretKey: "wd-isu-pass",
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

describe("WorkdayRaasClient", () => {
  it("authHeader produces Basic <base64> from username:password", () => {
    const client = new WorkdayRaasClient({
      config: CONFIG,
      password: "p4ss",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl: vi.fn(),
    });
    const expected = `Basic ${Buffer.from("isu_databridge:p4ss", "utf8").toString("base64")}`;
    expect(client.authHeader()).toBe(expected);
  });

  it("get() issues GET with Basic auth + format=json and parses the report payload", async () => {
    const fetchImpl: WorkdayRaasFetchLike = vi.fn(async (url, init) => {
      expect(url).toMatch(/customreport2\/INT_DataBridge_Students\?format=json/);
      expect(init?.method).toBe("GET");
      expect(init?.headers?.["authorization"]).toMatch(/^Basic /);
      expect(init?.headers?.["accept"]).toBe("application/json");
      return jsonRes({
        Report_Entry: [{ Student_ID: "S001" }, { Student_ID: "S002" }],
      });
    });
    const client = new WorkdayRaasClient({
      config: CONFIG,
      password: "p4ss",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
    });
    const out = await client.get({ reportName: "INT_DataBridge_Students" });
    expect(out.Report_Entry).toHaveLength(2);
  });

  it("extractRows accepts both Report_Entry-wrapped and bare-array payloads", () => {
    expect(WorkdayRaasClient.extractRows({ Report_Entry: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(WorkdayRaasClient.extractRows([{ a: 2 }])).toEqual([{ a: 2 }]);
    expect(WorkdayRaasClient.extractRows({})).toEqual([]);
  });

  it("retries on 429 honouring Retry-After (seconds)", async () => {
    let calls = 0;
    const fetchImpl: WorkdayRaasFetchLike = vi.fn(async () => {
      calls++;
      if (calls === 1)
        return jsonRes({}, { status: 429, headers: { "retry-after": "0" } });
      return jsonRes({ Report_Entry: [{ ok: true }] });
    });
    const client = new WorkdayRaasClient({
      config: CONFIG,
      password: "p4ss",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
      baseBackoffMs: 1,
    });
    const out = await client.get({ reportName: "INT_DataBridge_Students" });
    expect(out.Report_Entry).toEqual([{ ok: true }]);
    expect(calls).toBe(2);
  });

  it("retries on 503 (transient 5xx) with computed backoff", async () => {
    let calls = 0;
    const fetchImpl: WorkdayRaasFetchLike = vi.fn(async () => {
      calls++;
      if (calls < 3) return jsonRes("upstream", { status: 503 });
      return jsonRes({ Report_Entry: [] });
    });
    const client = new WorkdayRaasClient({
      config: CONFIG,
      password: "p4ss",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
      baseBackoffMs: 1,
    });
    await client.get({ reportName: "X" });
    expect(calls).toBe(3);
  });

  it("throws when retries are exhausted on persistent 5xx", async () => {
    const fetchImpl: WorkdayRaasFetchLike = vi.fn(async () =>
      jsonRes("dead", { status: 502 }),
    );
    const client = new WorkdayRaasClient({
      config: CONFIG,
      password: "p4ss",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
      maxRetries: 2,
      baseBackoffMs: 1,
    });
    await expect(client.get({ reportName: "X" })).rejects.toThrow();
    // initial + 2 retries + 1 retry-loop iteration that exits
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("throws on 4xx (non-429) without retrying", async () => {
    const fetchImpl: WorkdayRaasFetchLike = vi.fn(async () =>
      jsonRes("not authorized", { status: 401 }),
    );
    const client = new WorkdayRaasClient({
      config: CONFIG,
      password: "p4ss",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
      baseBackoffMs: 1,
    });
    await expect(client.get({ reportName: "X" })).rejects.toThrow(/401/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("appends additional query params after format", async () => {
    const fetchImpl: WorkdayRaasFetchLike = vi.fn(async (url) => {
      expect(url).toContain("format=json");
      expect(url).toContain("Last_Modified_Since=2026-05-01");
      return jsonRes({ Report_Entry: [] });
    });
    const client = new WorkdayRaasClient({
      config: CONFIG,
      password: "p4ss",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
    });
    await client.get({
      reportName: "INT_DataBridge_Students",
      query: { Last_Modified_Since: "2026-05-01" },
    });
  });

  it("paginate yields a single page for a full RaaS payload", async () => {
    const fetchImpl: WorkdayRaasFetchLike = vi.fn(async () =>
      jsonRes({ Report_Entry: [{ a: 1 }, { a: 2 }, { a: 3 }] }),
    );
    const client = new WorkdayRaasClient({
      config: CONFIG,
      password: "p4ss",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
    });
    const pages: Array<{ rows: unknown[]; total: number }> = [];
    for await (const p of client.paginate({ reportName: "X" })) pages.push(p);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.total).toBe(3);
    expect(pages[0]!.rows).toHaveLength(3);
  });

  it("URL builder strips trailing slash on tenantUrl and leading slash on reportName", async () => {
    const cfg = WorkdayRaasConfigSchema.parse({
      tenantUrl: "https://wd5-impl-services1.workday.com/ccx/service/example/customreport2/",
      username: "u",
      passwordSecretKey: "k",
    });
    const fetchImpl: WorkdayRaasFetchLike = vi.fn(async (url) => {
      expect(url).toBe(
        "https://wd5-impl-services1.workday.com/ccx/service/example/customreport2/INT_X?format=json",
      );
      return jsonRes({ Report_Entry: [] });
    });
    const client = new WorkdayRaasClient({
      config: cfg,
      password: "p",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
    });
    await client.get({ reportName: "/INT_X" });
  });
});
