import { describe, it, expect } from "vitest";
import { SalesforceEduAdapter, SalesforceClient } from "../index.js";
import { buildFetch, jsonResp, makeCtx, makeLogger } from "./test-utils.js";

const config = {
  instanceUrl: "https://acme.my.salesforce.com",
  clientId: "client-x",
  clientSecretKey: "salesforce/client-secret",
};

function adapterWith(queue: Parameters<typeof buildFetch>[0]): SalesforceEduAdapter {
  return new SalesforceEduAdapter(config, {
    httpClientFactory: (args) =>
      new SalesforceClient({
        config: args.config,
        clientSecret: args.clientSecret,
        logger: args.logger ?? makeLogger(),
        signal: args.signal,
        fetchImpl: buildFetch(queue),
        maxRetries: 1,
        baseBackoffMs: 1,
      }),
  });
}

describe("SalesforceEduAdapter — live path with injected http", () => {
  it("healthCheck returns healthy when token endpoint responds", async () => {
    const ad = adapterWith([
      jsonResp(200, {
        access_token: "t",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
    ]);
    const r = await ad.healthCheck(makeCtx());
    expect(r.healthy).toBe(true);
    expect(r.message).toBe("Salesforce reachable");
  });

  it("healthCheck reports unhealthy on token failure", async () => {
    const ad = adapterWith([
      { ok: false, status: 401, statusText: "Unauthorized", body: "bad creds" },
    ]);
    const r = await ad.healthCheck(makeCtx());
    expect(r.healthy).toBe(false);
  });

  it("sampleTable executes a SOQL against the configured SObject", async () => {
    const ad = adapterWith([
      jsonResp(200, {
        access_token: "t",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
      jsonResp(200, {
        totalSize: 1,
        done: true,
        records: [
          { Id: "001a", attributes: { type: "Contact" }, FirstName: "Ada", LastName: "Lovelace" },
        ],
      }),
    ]);
    const rows = await ad.sampleTable(makeCtx(), { resource: "Contact", limit: 5 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["LastName"]).toBe("Lovelace");
    expect(rows[0]?.["attributes"]).toBeUndefined();
  });

  it("streamRows yields pages and reports totalRows from totalSize", async () => {
    const ad = adapterWith([
      jsonResp(200, {
        access_token: "t",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
      jsonResp(200, {
        totalSize: 2,
        done: true,
        records: [{ Id: "001a" }, { Id: "001b" }],
      }),
    ]);
    const pages = [];
    for await (const p of ad.streamRows(makeCtx(), { resource: "Contact" })) {
      pages.push(p);
    }
    expect(pages).toHaveLength(1);
    expect(pages[0]?.totalRows).toBe(2);
    expect(pages[0]?.rows).toHaveLength(2);
  });

  it("getRecordById returns the row payload", async () => {
    const ad = adapterWith([
      jsonResp(200, {
        access_token: "t",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
      jsonResp(200, { Id: "001a", FirstName: "Ada" }),
    ]);
    const row = await ad.getRecordById(makeCtx(), { resource: "Contact", id: "001a" });
    expect(row?.["Id"]).toBe("001a");
  });

  it("getCodeLists surfaces picklists from describe", async () => {
    const ad = adapterWith([
      jsonResp(200, {
        access_token: "t",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
      ...Array.from({ length: 6 }, () =>
        jsonResp(200, {
          name: "Contact",
          fields: [
            {
              name: "hed__FERPA__c",
              type: "picklist",
              nillable: true,
              picklistValues: [
                { value: "Granted", active: true },
                { value: "Withheld", active: true },
              ],
            },
          ],
        })
      ),
    ]);
    const codeLists = await ad.getCodeLists(makeCtx());
    expect(codeLists.length).toBeGreaterThan(0);
    expect(codeLists[0]?.entries).toHaveLength(2);
  });

  it("getDictionary yields entries from describe payloads", async () => {
    const ad = adapterWith([
      jsonResp(200, {
        access_token: "t",
        instance_url: "https://acme.my.salesforce.com",
        expires_in: 3600,
      }),
      ...Array.from({ length: 6 }, () =>
        jsonResp(200, {
          name: "Contact",
          fields: [
            { name: "Id", type: "id", nillable: false },
            { name: "Email", type: "email", nillable: true },
          ],
        })
      ),
    ]);
    const dict = await ad.getDictionary(makeCtx());
    expect(dict.length).toBeGreaterThan(0);
    const idEntry = dict.find((e) => e.fieldCode === "Id");
    expect(idEntry?.isMandatory).toBe(true);
  });
});
