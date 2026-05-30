import { describe, it, expect } from "vitest";
import { DataverseClient } from "../http.js";
import { buildFetch, jsonResp, makeLogger } from "./test-utils.js";

function client(queue: Parameters<typeof buildFetch>[0]): DataverseClient {
  return new DataverseClient({
    config: {
      dataverseUrl: "https://acme.crm4.dynamics.com",
      tenantId: "tenant-123",
      clientId: "client-x",
      clientSecretKey: "dynamics/client-secret",
      apiVersion: "v9.2",
      timeoutMs: 60_000,
    },
    clientSecret: "shh",
    logger: makeLogger(),
    signal: new AbortController().signal,
    fetchImpl: buildFetch(queue),
    maxRetries: 2,
    baseBackoffMs: 1,
  });
}

describe("DataverseClient — token acquisition", () => {
  it("acquires and caches an access token", async () => {
    const c = client([jsonResp(200, { access_token: "tkn", expires_in: 3600 })]);
    const t = await c.getAccessToken();
    expect(t.accessToken).toBe("tkn");
    const t2 = await c.getAccessToken();
    expect(t2).toBe(t);
  });

  it("throws when OAuth returns a non-2xx response", async () => {
    const c = client([{ ok: false, status: 401, statusText: "Unauthorized", body: "bad" }]);
    await expect(c.getAccessToken()).rejects.toThrow(/OAuth2 token request failed/);
  });
});

describe("DataverseClient — query + paging", () => {
  it("executes an OData query against an entity set", async () => {
    const c = client([
      jsonResp(200, { access_token: "t", expires_in: 3600 }),
      jsonResp(200, { value: [{ contactid: "id-1" }, { contactid: "id-2" }] }),
    ]);
    const page = await c.query("contacts", { select: "contactid", top: 2 });
    expect(page.value).toHaveLength(2);
  });

  it("queryAll iterates pages via @odata.nextLink", async () => {
    const c = client([
      jsonResp(200, { access_token: "t", expires_in: 3600 }),
      jsonResp(200, {
        value: [{ contactid: "1" }, { contactid: "2" }],
        "@odata.nextLink": "https://acme.crm4.dynamics.com/api/data/v9.2/contacts?$skiptoken=ABC",
      }),
      jsonResp(200, { value: [{ contactid: "3" }] }),
    ]);
    const pages: number[] = [];
    for await (const p of c.queryAll("contacts")) {
      pages.push(p.value.length);
    }
    expect(pages).toEqual([2, 1]);
  });
});

describe("DataverseClient — describe", () => {
  it("returns EntityDefinitions for a logical name", async () => {
    const c = client([
      jsonResp(200, { access_token: "t", expires_in: 3600 }),
      jsonResp(200, {
        LogicalName: "contact",
        EntitySetName: "contacts",
        Attributes: [{ LogicalName: "contactid", AttributeType: "Uniqueidentifier" }],
      }),
    ]);
    const def = await c.describe("contact");
    expect(def.LogicalName).toBe("contact");
    expect(def.Attributes).toHaveLength(1);
  });
});

describe("DataverseClient — retry behaviour", () => {
  it("retries on 503 then succeeds", async () => {
    const c = client([
      jsonResp(200, { access_token: "t", expires_in: 3600 }),
      { ok: false, status: 503, statusText: "Busy", body: "{}", headers: { "retry-after": "0" } },
      jsonResp(200, { value: [] }),
    ]);
    const page = await c.query("contacts");
    expect(page.value).toEqual([]);
  });

  it("returns null from getRecord on a 404", async () => {
    const c = client([
      jsonResp(200, { access_token: "t", expires_in: 3600 }),
      { ok: false, status: 404, statusText: "Not Found", body: "missing" },
    ]);
    const row = await c.getRecord("contacts", "missing-id");
    expect(row).toBeNull();
  });

  it("gives up after maxRetries", async () => {
    const c = client([
      jsonResp(200, { access_token: "t", expires_in: 3600 }),
      { ok: false, status: 503, statusText: "Busy", body: "down", headers: { "retry-after": "0" } },
      { ok: false, status: 503, statusText: "Busy", body: "down", headers: { "retry-after": "0" } },
      { ok: false, status: 503, statusText: "Busy", body: "down", headers: { "retry-after": "0" } },
    ]);
    await expect(c.query("contacts")).rejects.toThrow(/503/);
  });
});
