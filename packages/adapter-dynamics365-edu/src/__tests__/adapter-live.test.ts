import { describe, it, expect } from "vitest";
import { Dynamics365EduAdapter, DataverseClient } from "../index.js";
import { buildFetch, jsonResp, makeCtx, makeLogger } from "./test-utils.js";

const config = {
  dataverseUrl: "https://acme.crm4.dynamics.com",
  tenantId: "tenant-123",
  clientId: "client-x",
  clientSecretKey: "dynamics/client-secret",
};

function adapterWith(queue: Parameters<typeof buildFetch>[0]): Dynamics365EduAdapter {
  return new Dynamics365EduAdapter(config, {
    httpClientFactory: (args) =>
      new DataverseClient({
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

describe("Dynamics365EduAdapter — live path", () => {
  it("healthCheck succeeds when token endpoint responds", async () => {
    const ad = adapterWith([jsonResp(200, { access_token: "t", expires_in: 3600 })]);
    const r = await ad.healthCheck(makeCtx());
    expect(r.healthy).toBe(true);
    expect(r.message).toBe("Dataverse reachable");
  });

  it("healthCheck reports unhealthy on token failure", async () => {
    const ad = adapterWith([{ ok: false, status: 401, statusText: "Unauthorized", body: "bad" }]);
    const r = await ad.healthCheck(makeCtx());
    expect(r.healthy).toBe(false);
  });

  it("sampleTable issues an OData query and strips @odata.* keys", async () => {
    const ad = adapterWith([
      jsonResp(200, { access_token: "t", expires_in: 3600 }),
      jsonResp(200, {
        "@odata.context": "...",
        value: [{ contactid: "id-1", lastname: "Lovelace", "@odata.etag": "W/x" }],
      }),
    ]);
    const rows = await ad.sampleTable(makeCtx(), { resource: "Contact", limit: 5 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["lastname"]).toBe("Lovelace");
    expect(rows[0]?.["@odata.etag"]).toBeUndefined();
  });

  it("streamRows yields pages from the OData iterator", async () => {
    const ad = adapterWith([
      jsonResp(200, { access_token: "t", expires_in: 3600 }),
      jsonResp(200, {
        value: [{ contactid: "1" }, { contactid: "2" }],
      }),
    ]);
    const pages = [];
    for await (const p of ad.streamRows(makeCtx(), { resource: "Contact" })) {
      pages.push(p);
    }
    expect(pages).toHaveLength(1);
    expect(pages[0]?.rows).toHaveLength(2);
  });

  it("getRecordById fetches via the entity set", async () => {
    const ad = adapterWith([
      jsonResp(200, { access_token: "t", expires_in: 3600 }),
      jsonResp(200, { contactid: "id-1", lastname: "Test" }),
    ]);
    const row = await ad.getRecordById(makeCtx(), { resource: "Contact", id: "id-1" });
    expect(row?.["lastname"]).toBe("Test");
  });

  it("getCodeLists surfaces OptionSet picklists from EntityDefinitions", async () => {
    const ad = adapterWith([
      jsonResp(200, { access_token: "t", expires_in: 3600 }),
      ...Array.from({ length: 6 }, () =>
        jsonResp(200, {
          LogicalName: "contact",
          Attributes: [
            {
              LogicalName: "msdyn_studenttype",
              AttributeType: "Picklist",
              OptionSet: {
                Options: [
                  { Value: 1, Label: { UserLocalizedLabel: { Label: "Undergraduate" } } },
                  { Value: 2, Label: { UserLocalizedLabel: { Label: "Postgraduate" } } },
                ],
              },
            },
          ],
        })
      ),
    ]);
    const lists = await ad.getCodeLists(makeCtx());
    expect(lists.length).toBeGreaterThan(0);
    expect(lists[0]?.entries).toHaveLength(2);
  });

  it("getDictionary returns entries via EntityDefinitions describe", async () => {
    const ad = adapterWith([
      jsonResp(200, { access_token: "t", expires_in: 3600 }),
      ...Array.from({ length: 6 }, () =>
        jsonResp(200, {
          LogicalName: "contact",
          Attributes: [
            {
              LogicalName: "contactid",
              AttributeType: "Uniqueidentifier",
              RequiredLevel: { Value: "SystemRequired" },
            },
            { LogicalName: "lastname", AttributeType: "String" },
          ],
        })
      ),
    ]);
    const dict = await ad.getDictionary(makeCtx());
    expect(dict.length).toBeGreaterThan(0);
    expect(dict.find((d) => d.fieldCode === "contactid")?.isMandatory).toBe(true);
  });
});
