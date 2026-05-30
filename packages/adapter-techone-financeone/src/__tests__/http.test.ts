import { describe, it, expect, vi } from "vitest";
import { TechOneConnectClient, type FetchLike } from "../http.js";
import { TechOneFinanceOneConfigSchema } from "../config.js";

const CONFIG = TechOneFinanceOneConfigSchema.parse({
  tenantUrl: "https://customer.techoneglobal.com",
  clientId: "databridge-client",
  clientSecretKey: "t1-connect-secret",
});

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function jsonRes(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
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

describe("TechOneConnectClient", () => {
  it("mints an OAuth2 token via client_credentials and caches it", async () => {
    const fetchImpl: FetchLike = vi.fn(async (url, init) => {
      expect(url).toBe("https://customer.techoneglobal.com/connect/api/v1/oauth2/token");
      expect(init?.method).toBe("POST");
      expect(init?.headers?.["content-type"]).toBe("application/x-www-form-urlencoded");
      expect(init?.body).toContain("grant_type=client_credentials");
      expect(init?.body).toContain("client_id=databridge-client");
      expect(init?.body).toContain("client_secret=secret-from-vault");
      return jsonRes({ access_token: "tok-1", expires_in: 3600 });
    });

    const client = new TechOneConnectClient({
      config: CONFIG,
      clientSecret: "secret-from-vault",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
      now: () => 1_000_000,
    });

    const t1 = await client.getAccessToken();
    const t2 = await client.getAccessToken();
    expect(t1).toBe("tok-1");
    expect(t2).toBe("tok-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(client.getCachedToken()?.expiresAtMs).toBe(1_000_000 + 3600 * 1000);
  });

  it("re-mints a token when the cached one is within the 60s cushion", async () => {
    let now = 1_000_000;
    const fetchImpl: FetchLike = vi.fn(async () =>
      jsonRes({ access_token: `tok-at-${now}`, expires_in: 60 })
    );
    const client = new TechOneConnectClient({
      config: CONFIG,
      clientSecret: "s",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
      now: () => now,
    });
    await client.getAccessToken();
    now += 30_000; // still inside cushion → must re-mint
    await client.getAccessToken();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws a descriptive error when the token endpoint returns 401", async () => {
    const fetchImpl: FetchLike = async () => jsonRes("invalid_client", { status: 401 });
    const client = new TechOneConnectClient({
      config: CONFIG,
      clientSecret: "s",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
    });
    await expect(client.getAccessToken()).rejects.toThrow(/token mint failed.*401/);
  });

  it("authenticates GETs with the bearer token and parses JSON", async () => {
    const calls: { url: string; auth: string | undefined }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      if (url.endsWith("/oauth2/token")) {
        return jsonRes({ access_token: "tok-xyz", expires_in: 3600 });
      }
      calls.push({ url, auth: init?.headers?.["authorization"] });
      return jsonRes({ greeting: "hello" });
    };
    const client = new TechOneConnectClient({
      config: CONFIG,
      clientSecret: "s",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
    });
    const out = await client.get<{ greeting: string }>({
      path: "metadata/health",
      query: { ledger: "01" },
    });
    expect(out.greeting).toBe("hello");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://customer.techoneglobal.com/connect/api/v1/metadata/health?ledger=01"
    );
    expect(calls[0]?.auth).toBe("Bearer tok-xyz");
  });

  it("retries on 429 honoring Retry-After then succeeds", async () => {
    let getAttempt = 0;
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith("/oauth2/token")) {
        return jsonRes({ access_token: "tok", expires_in: 3600 });
      }
      getAttempt++;
      if (getAttempt === 1) {
        return jsonRes("rate limited", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return jsonRes({ ok: true });
    };
    const client = new TechOneConnectClient({
      config: CONFIG,
      clientSecret: "s",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
      maxRetries: 2,
      baseBackoffMs: 1,
    });
    const out = await client.get<{ ok: boolean }>({ path: "x" });
    expect(out.ok).toBe(true);
    expect(getAttempt).toBe(2);
  });

  it("retries on 5xx and surfaces the last error after max retries", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith("/oauth2/token")) {
        return jsonRes({ access_token: "tok", expires_in: 3600 });
      }
      return jsonRes("boom", { status: 503 });
    };
    const client = new TechOneConnectClient({
      config: CONFIG,
      clientSecret: "s",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
      maxRetries: 2,
      baseBackoffMs: 1,
    });
    await expect(client.get({ path: "x" })).rejects.toThrow(/HTTP 503/);
  });

  it("does not retry on 4xx that are not 429/401 — propagates immediately", async () => {
    let attempts = 0;
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith("/oauth2/token")) {
        return jsonRes({ access_token: "tok", expires_in: 3600 });
      }
      attempts++;
      return jsonRes("nope", { status: 400 });
    };
    const client = new TechOneConnectClient({
      config: CONFIG,
      clientSecret: "s",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
      baseBackoffMs: 1,
    });
    await expect(client.get({ path: "x" })).rejects.toThrow(/400/);
    expect(attempts).toBe(1);
  });

  it("force-refreshes the token once on 401 from a resource endpoint", async () => {
    let mintCount = 0;
    let getAttempt = 0;
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith("/oauth2/token")) {
        mintCount++;
        return jsonRes({ access_token: `tok-${mintCount}`, expires_in: 3600 });
      }
      getAttempt++;
      if (getAttempt === 1) return jsonRes("expired", { status: 401 });
      return jsonRes({ ok: true });
    };
    const client = new TechOneConnectClient({
      config: CONFIG,
      clientSecret: "s",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
      baseBackoffMs: 1,
    });
    const out = await client.get<{ ok: boolean }>({ path: "x" });
    expect(out.ok).toBe(true);
    expect(mintCount).toBe(2);
    expect(getAttempt).toBe(2);
  });

  it("paginate yields each page and stops when totalRecords is reached", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith("/oauth2/token")) {
        return jsonRes({ access_token: "tok", expires_in: 3600 });
      }
      const u = new URL(url);
      const page = Number.parseInt(u.searchParams.get("pageNumber") ?? "1", 10);
      const pageSize = Number.parseInt(u.searchParams.get("pageSize") ?? "500", 10);
      // 3 records total, pageSize 2 → 2 pages.
      const data = page === 1 ? [{ id: "a" }, { id: "b" }] : page === 2 ? [{ id: "c" }] : [];
      return jsonRes({ data, pageNumber: page, pageSize, totalRecords: 3 });
    };
    const client = new TechOneConnectClient({
      config: { ...CONFIG, pageSize: 2 },
      clientSecret: "s",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl,
    });
    const seen: string[] = [];
    for await (const page of client.paginate<{ id: string }>({ path: "things" })) {
      for (const r of page.data) seen.push(r.id);
    }
    expect(seen).toEqual(["a", "b", "c"]);
  });
});
