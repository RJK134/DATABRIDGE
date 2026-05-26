/**
 * /audits route RBAC tests \u2014 builds the API server with static-token auth
 * enabled via DATABRIDGE_API_TOKENS and verifies that:
 *   - POST /audits/run requires data:steward or migration:operator
 *   - GET /audits requires audit:viewer / data:viewer / data:steward
 *   - GET /audits/:id allows holders of viewer roles in the record's tenant
 *   - system:superadmin bypasses everything
 *   - Missing/invalid tokens return 401
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

import { build } from "../server.js";
import { auditStore } from "../audit-store.js";
import { _resetAuthActiveForTests } from "../middleware/auth.js";

// Token table covers every role scenario we need.
const TOKEN_ENV = [
  // steward: can run + view audits in t1
  "tok-steward=steward-1,t1:data:steward",
  // operator: can run audits in t1, has no read role
  "tok-operator=op-1,t1:migration:operator",
  // viewer: read-only in t1
  "tok-viewer=viewer-1,t1:audit:viewer",
  // outsider: viewer in t2 only
  "tok-outsider=outsider-1,t2:data:viewer",
  // super: cross-tenant superadmin
  "tok-super=super-1,*:system:superadmin",
].join(";");

describe("apps/api /audits RBAC (static-token auth)", () => {
  let app: FastifyInstance;
  let savedTokens: string | undefined;

  beforeAll(async () => {
    savedTokens = process.env["DATABRIDGE_API_TOKENS"];
    process.env["DATABRIDGE_API_TOKENS"] = TOKEN_ENV;
    _resetAuthActiveForTests();
    // Sync-mode matches the existing 200-style assertions in this suite.
    app = await build({ awaitAuditCompletion: true });
  });
  afterAll(async () => {
    await app.close();
    if (savedTokens === undefined) delete process.env["DATABRIDGE_API_TOKENS"];
    else process.env["DATABRIDGE_API_TOKENS"] = savedTokens;
    _resetAuthActiveForTests();
  });
  beforeEach(async () => {
    await auditStore.clear();
  });

  // -------- POST /audits/run --------

  it("POST /audits/run \u2014 401 when no bearer token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /audits/run \u2014 401 when token is unknown", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
      headers: { authorization: "Bearer not-a-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /audits/run \u2014 403 when token has no write role in tenant", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
      headers: { authorization: "Bearer tok-viewer" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: /insufficient role/ });
  });

  it("POST /audits/run \u2014 403 when token has roles in a different tenant", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
      headers: { authorization: "Bearer tok-outsider" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("POST /audits/run \u2014 200 for data:steward", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
      headers: { authorization: "Bearer tok-steward" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe("succeeded");
  });

  it("POST /audits/run \u2014 200 for migration:operator", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
      headers: { authorization: "Bearer tok-operator" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("POST /audits/run \u2014 200 for system:superadmin even in other tenant", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t99" },
      headers: { authorization: "Bearer tok-super" },
    });
    expect(res.statusCode).toBe(200);
  });

  // -------- GET /audits --------

  it("GET /audits \u2014 401 without token", async () => {
    const res = await app.inject({ method: "GET", url: "/audits?tenantId=t1" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /audits \u2014 403 when tenantId param missing (we require scoped lists)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/audits",
      headers: { authorization: "Bearer tok-viewer" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /audits \u2014 200 for audit:viewer in matching tenant", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/audits?tenantId=t1",
      headers: { authorization: "Bearer tok-viewer" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("audits");
  });

  // -------- GET /audits/:id --------

  it("GET /audits/:id \u2014 200 for viewer in record's tenant", async () => {
    // Create a record via the steward path first.
    const created = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
      headers: { authorization: "Bearer tok-steward" },
    });
    const id = (created.json() as { auditId: string }).auditId;

    const res = await app.inject({
      method: "GET",
      url: `/audits/${id}`,
      headers: { authorization: "Bearer tok-viewer" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { auditId: string }).auditId).toBe(id);
  });

  it("GET /audits/:id \u2014 403 for viewer in a different tenant", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
      headers: { authorization: "Bearer tok-steward" },
    });
    const id = (created.json() as { auditId: string }).auditId;

    const res = await app.inject({
      method: "GET",
      url: `/audits/${id}`,
      headers: { authorization: "Bearer tok-outsider" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /audits/:id \u2014 200 for system:superadmin regardless of tenant", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
      headers: { authorization: "Bearer tok-steward" },
    });
    const id = (created.json() as { auditId: string }).auditId;

    const res = await app.inject({
      method: "GET",
      url: `/audits/${id}`,
      headers: { authorization: "Bearer tok-super" },
    });
    expect(res.statusCode).toBe(200);
  });
});
