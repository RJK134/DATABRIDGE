/**
 * Tests for the async /audits/run flow (F2): the default mode returns
 * 202+location, persists status=queued first, and lets the worker complete
 * the run in the background. Also exercises POST /audits/:id/cancel.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

import { build } from "../server.js";
import { auditStore } from "../audit-store.js";
import { _resetAuthActiveForTests } from "../middleware/auth.js";
import { _clearInflightForTests } from "../audit-runner.js";

describe("apps/api /audits async flow (F2)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    _resetAuthActiveForTests();
    _clearInflightForTests();
    // Default: awaitCompletion=false \u2014 we exercise the real 202 path.
    app = await build();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await auditStore.clear();
    _clearInflightForTests();
  });

  it("POST /audits/run returns 202 + auditId + location header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json() as { auditId: string; status: string };
    expect(body.status).toBe("queued");
    expect(body.auditId).toBeTruthy();
    expect(res.headers["location"]).toBe(`/audits/${body.auditId}`);
  });

  it("the audit record exists in 'queued' or 'running' state immediately after the 202", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
    });
    const { auditId } = res.json() as { auditId: string };
    const rec = await auditStore.get(auditId);
    expect(rec).toBeDefined();
    expect(["queued", "running", "succeeded"]).toContain(rec?.status);
  });

  it("the worker eventually transitions the record to a terminal state", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
    });
    const { auditId } = res.json() as { auditId: string };
    // Poll up to 2s for completion.
    const deadline = Date.now() + 2000;
    let rec = await auditStore.get(auditId);
    while (
      rec &&
      !["succeeded", "failed", "cancelled"].includes(rec.status) &&
      Date.now() < deadline
    ) {
      await new Promise<void>((r) => setTimeout(r, 10));
      rec = await auditStore.get(auditId);
    }
    expect(rec?.status).toBe("succeeded");
    expect(rec?.report).toBeDefined();
  });

  it("POST /audits/run with unknown profile still returns 404 synchronously", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "ghost", tenantId: "t1" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /audits/run with unknown adapter still returns 400 synchronously", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: {
        profileId: "sits",
        tenantId: "t1",
        adapterId: "ghost-adapter",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /audits/:id/cancel on a finished audit returns aborted:false", async () => {
    // First create an audit and let it finish.
    const create = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1" },
    });
    const { auditId } = create.json() as { auditId: string };
    const deadline = Date.now() + 2000;
    let rec = await auditStore.get(auditId);
    while (rec && rec.status !== "succeeded" && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 10));
      rec = await auditStore.get(auditId);
    }
    expect(rec?.status).toBe("succeeded");

    const res = await app.inject({
      method: "POST",
      url: `/audits/${auditId}/cancel`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ aborted: false, auditId });
  });

  it("POST /audits/:id/cancel on a missing audit returns 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/does-not-exist/cancel",
    });
    expect(res.statusCode).toBe(404);
  });
});
