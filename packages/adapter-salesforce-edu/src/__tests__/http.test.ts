import { describe, it, expect } from "vitest";
import { SalesforceClient } from "../http.js";
import { buildFetch, jsonResp, makeLogger } from "./test-utils.js";

function client(queue: Parameters<typeof buildFetch>[0]): SalesforceClient {
  return new SalesforceClient({
    config: {
      instanceUrl: "https://acme.my.salesforce.com",
      clientId: "client-x",
      clientSecretKey: "salesforce/client-secret",
      apiVersion: "v60.0",
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

describe("SalesforceClient — token acquisition", () => {
  it("acquires and caches an access token via client_credentials", async () => {
    const c = client([
      jsonResp(200, {
        access_token: "tkn",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
    ]);
    const t = await c.getAccessToken();
    expect(t.accessToken).toBe("tkn");
    expect(t.instanceUrl).toBe("https://acme.my.salesforce.com");

    // second call should NOT issue a new request (queue would be empty)
    const t2 = await c.getAccessToken();
    expect(t2).toBe(t);
  });

  it("refreshes the token when expiry is within 60 seconds", async () => {
    let now = 1_000_000;
    const c = new SalesforceClient({
      config: {
        instanceUrl: "https://acme.my.salesforce.com",
        clientId: "client-x",
        clientSecretKey: "salesforce/client-secret",
        apiVersion: "v60.0",
        timeoutMs: 60_000,
      },
      clientSecret: "shh",
      logger: makeLogger(),
      signal: new AbortController().signal,
      fetchImpl: buildFetch([
        jsonResp(200, {
          access_token: "t1",
          instance_url: "https://acme.my.salesforce.com",
          expires_in: 70,
        }),
        jsonResp(200, {
          access_token: "t2",
          instance_url: "https://acme.my.salesforce.com",
          expires_in: 3600,
        }),
      ]),
      maxRetries: 2,
      baseBackoffMs: 1,
      now: () => now,
    });
    const t1 = await c.getAccessToken();
    expect(t1.accessToken).toBe("t1");

    // Advance past the 60-second freshness window.
    now += 20 * 1000;
    const t2 = await c.getAccessToken();
    expect(t2.accessToken).toBe("t2");
  });

  it("throws when OAuth returns a non-2xx response", async () => {
    const c = client([{ ok: false, status: 401, statusText: "Unauthorized", body: "bad creds" }]);
    await expect(c.getAccessToken()).rejects.toThrow(/OAuth2 token request failed/);
  });
});

describe("SalesforceClient — query", () => {
  it("executes SOQL and returns the first page", async () => {
    const c = client([
      jsonResp(200, {
        access_token: "t",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
      jsonResp(200, {
        totalSize: 2,
        done: true,
        records: [
          { Id: "001a", Email: "a@x" },
          { Id: "001b", Email: "b@x" },
        ],
      }),
    ]);
    const page = await c.query("SELECT Id, Email FROM Contact");
    expect(page.totalSize).toBe(2);
    expect(page.records).toHaveLength(2);
  });

  it("queryAll iterates pages via nextRecordsUrl", async () => {
    const c = client([
      jsonResp(200, {
        access_token: "t",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
      jsonResp(200, {
        totalSize: 4,
        done: false,
        records: [{ Id: "1" }, { Id: "2" }],
        nextRecordsUrl: "/services/data/v60.0/query/A-1000-2",
      }),
      jsonResp(200, {
        totalSize: 4,
        done: true,
        records: [{ Id: "3" }, { Id: "4" }],
      }),
    ]);
    const pages: number[] = [];
    for await (const p of c.queryAll("SELECT Id FROM Contact")) {
      pages.push(p.records.length);
    }
    expect(pages).toEqual([2, 2]);
  });
});

describe("SalesforceClient — describe", () => {
  it("returns the describe payload for an SObject", async () => {
    const c = client([
      jsonResp(200, {
        access_token: "t",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
      jsonResp(200, {
        name: "Contact",
        fields: [
          { name: "Id", type: "id", nillable: false },
          { name: "Email", type: "email", nillable: true },
        ],
      }),
    ]);
    const d = await c.describe("Contact");
    expect(d.name).toBe("Contact");
    expect(d.fields).toHaveLength(2);
  });
});

describe("SalesforceClient — retry behaviour", () => {
  it("retries on 503 and eventually succeeds", async () => {
    const c = client([
      jsonResp(200, {
        access_token: "t",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
      { ok: false, status: 503, statusText: "Busy", body: "{}", headers: { "retry-after": "0" } },
      jsonResp(200, { totalSize: 0, done: true, records: [] }),
    ]);
    const page = await c.query("SELECT Id FROM Contact");
    expect(page.totalSize).toBe(0);
  });

  it("gives up after maxRetries non-2xx responses", async () => {
    const c = client([
      jsonResp(200, {
        access_token: "t",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
      { ok: false, status: 503, statusText: "Busy", body: "down", headers: { "retry-after": "0" } },
      { ok: false, status: 503, statusText: "Busy", body: "down", headers: { "retry-after": "0" } },
      { ok: false, status: 503, statusText: "Busy", body: "down", headers: { "retry-after": "0" } },
    ]);
    await expect(c.query("SELECT Id FROM Contact")).rejects.toThrow(/503/);
  });

  it("returns null from getRecord on a 404", async () => {
    const c = client([
      jsonResp(200, {
        access_token: "t",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
      { ok: false, status: 404, statusText: "Not Found", body: "[]" },
    ]);
    const row = await c.getRecord("Contact", "001missing");
    expect(row).toBeNull();
  });
});
