import { describe, it, expect } from "vitest";
import { SalesforceEduAdapter, SUPPORTED_RESOURCES } from "../index.js";
import { makeCtx } from "./test-utils.js";

const config = {
  instanceUrl: "https://acme.my.salesforce.com",
  clientId: "client-x",
  clientSecretKey: "salesforce/client-secret",
};

describe("SalesforceEduAdapter — stub-fallback path", () => {
  it("reports stub healthCheck when no secret is available", async () => {
    const ad = new SalesforceEduAdapter(config);
    const result = await ad.healthCheck(makeCtx(undefined));
    expect(result.healthy).toBe(true);
    expect(result.message).toMatch(/stub/);
  });

  it("returns empty arrays from sampleTable / getCodeLists / getDictionary in stub mode", async () => {
    const ad = new SalesforceEduAdapter(config);
    const ctx = makeCtx(undefined);
    expect(await ad.sampleTable(ctx, { resource: "Contact", limit: 10 })).toEqual([]);
    expect(await ad.getCodeLists(ctx)).toEqual([]);
    expect(await ad.getDictionary(ctx)).toEqual([]);
  });

  it("streamRows yields a single empty page in stub mode", async () => {
    const ad = new SalesforceEduAdapter(config);
    const pages = [];
    for await (const p of ad.streamRows(makeCtx(undefined), { resource: "Contact" })) {
      pages.push(p);
    }
    expect(pages).toEqual([{ rows: [], totalRows: 0 }]);
  });

  it("getRecordById returns null in stub mode", async () => {
    const ad = new SalesforceEduAdapter(config);
    const r = await ad.getRecordById(makeCtx(undefined), { resource: "Contact", id: "001" });
    expect(r).toBeNull();
  });

  it("rejects unsupported resources", async () => {
    const ad = new SalesforceEduAdapter(config);
    await expect(
      ad.sampleTable(makeCtx(undefined), { resource: "Made_Up__c", limit: 1 })
    ).rejects.toThrow(/not supported/);
  });

  it("declares the documented capability surface", () => {
    const ad = new SalesforceEduAdapter(config);
    expect(ad.capabilities.preferredAuth).toBe("oauth2");
    expect(ad.capabilities.supportsDictionary).toBe(true);
    expect(ad.capabilities.supportsCodeLists).toBe(true);
  });

  it("discoverSchema covers every supported resource", async () => {
    const ad = new SalesforceEduAdapter(config);
    const schema = await ad.discoverSchema(makeCtx());
    expect(schema.adapter).toBe("salesforce-edu");
    expect(schema.resources).toHaveLength(SUPPORTED_RESOURCES.length);
  });

  it("static primaryKeyFor returns Id for every Salesforce resource", () => {
    for (const r of SUPPORTED_RESOURCES) {
      expect(SalesforceEduAdapter.primaryKeyFor(r)).toBe("Id");
    }
  });
});
