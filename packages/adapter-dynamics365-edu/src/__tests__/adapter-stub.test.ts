import { describe, it, expect } from "vitest";
import { Dynamics365EduAdapter, SUPPORTED_RESOURCES } from "../index.js";
import { makeCtx } from "./test-utils.js";

const config = {
  dataverseUrl: "https://acme.crm4.dynamics.com",
  tenantId: "tenant-123",
  clientId: "client-x",
  clientSecretKey: "dynamics/client-secret",
};

describe("Dynamics365EduAdapter — stub-fallback path", () => {
  it("healthCheck reports stub when no secret available", async () => {
    const ad = new Dynamics365EduAdapter(config);
    const r = await ad.healthCheck(makeCtx(undefined));
    expect(r.healthy).toBe(true);
    expect(r.message).toMatch(/stub/);
  });

  it("sampleTable / getCodeLists / getDictionary return [] in stub mode", async () => {
    const ad = new Dynamics365EduAdapter(config);
    const ctx = makeCtx(undefined);
    expect(await ad.sampleTable(ctx, { resource: "Contact", limit: 5 })).toEqual([]);
    expect(await ad.getCodeLists(ctx)).toEqual([]);
    expect(await ad.getDictionary(ctx)).toEqual([]);
  });

  it("streamRows yields a single empty page in stub mode", async () => {
    const ad = new Dynamics365EduAdapter(config);
    const pages = [];
    for await (const p of ad.streamRows(makeCtx(undefined), { resource: "Contact" })) {
      pages.push(p);
    }
    expect(pages).toEqual([{ rows: [], totalRows: 0 }]);
  });

  it("getRecordById returns null in stub mode", async () => {
    const ad = new Dynamics365EduAdapter(config);
    const r = await ad.getRecordById(makeCtx(undefined), { resource: "Contact", id: "x" });
    expect(r).toBeNull();
  });

  it("rejects unsupported resources", async () => {
    const ad = new Dynamics365EduAdapter(config);
    await expect(
      ad.sampleTable(makeCtx(undefined), { resource: "noSuchEntity", limit: 1 })
    ).rejects.toThrow(/not supported/);
  });

  it("discoverSchema covers every supported resource", async () => {
    const ad = new Dynamics365EduAdapter(config);
    const s = await ad.discoverSchema(makeCtx());
    expect(s.adapter).toBe("dynamics365-edu");
    expect(s.resources).toHaveLength(SUPPORTED_RESOURCES.length);
  });

  it("primaryKeyFor returns the entity-prefixed id", () => {
    expect(Dynamics365EduAdapter.primaryKeyFor("Contact")).toBe("contactid");
    expect(Dynamics365EduAdapter.primaryKeyFor("Program")).toBe("msdyn_programid");
  });

  it("declares oauth2 + dictionary capabilities", () => {
    const ad = new Dynamics365EduAdapter(config);
    expect(ad.capabilities.preferredAuth).toBe("oauth2");
    expect(ad.capabilities.supportsDictionary).toBe(true);
  });
});
