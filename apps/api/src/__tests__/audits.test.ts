/**
 * /audits route tests — exercises POST /audits/run with the SITS profile
 * (SQL-only rules) and the HESA-TDP profile (Fn rules). DATABASE_URL is
 * not set, so PgSqlExecutor is bypassed and we get the NoopSqlExecutor
 * fallback. Fn rules without a source are skipped with a warning.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

import { build } from "../server.js";
import { auditStore } from "../audit-store.js";
import { _resetAuthActiveForTests } from "../middleware/auth.js";

describe("apps/api /audits", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Belt-and-braces: ensure auth is disabled for this suite even if a
    // prior test in the same worker flipped the module-level flag on.
    _resetAuthActiveForTests();
    // awaitAuditCompletion=true keeps these tests using the old
    // sync-style 200 response shape — the F2 default is 202 + poll.
    app = await build({ awaitAuditCompletion: true });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await auditStore.clear();
  });

  it("POST /audits/run returns 400 on missing body fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("invalid_body");
  });

  it("POST /audits/run returns 404 for unknown profile", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "nope", tenantId: "t1" },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe("profile_not_found");
  });

  it("POST /audits/run with sits profile succeeds (SQL no-op path)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "tenant-1" },
    });
    expect(res.statusCode).toBe(200);
    const rec = res.json() as {
      status: string;
      tenantId: string;
      report: { findingsTotal: number; rulesSql: number };
    };
    expect(rec.status).toBe("succeeded");
    expect(rec.tenantId).toBe("tenant-1");
    expect(rec.report.findingsTotal).toBe(0);
    expect(rec.report.rulesSql).toBeGreaterThan(0);
  });

  it("POST /audits/run with hesa-tdp profile warns when no source given", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "hesa-tdp", tenantId: "tenant-2" },
    });
    expect(res.statusCode).toBe(200);
    const rec = res.json() as {
      report: { rulesFn: number; warnings: string[] };
    };
    expect(rec.report.rulesFn).toBeGreaterThan(0);
    // No source supplied → Fn rules skipped with a warning.
    expect(rec.report.warnings.length).toBeGreaterThan(0);
  });

  it("GET /audits returns records newest-first; tenantId filter works", async () => {
    await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "alpha" },
    });
    await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "beta" },
    });
    const all = await app.inject({ method: "GET", url: "/audits" });
    expect(all.statusCode).toBe(200);
    expect((all.json() as { audits: unknown[] }).audits).toHaveLength(2);

    const filtered = await app.inject({
      method: "GET",
      url: "/audits?tenantId=alpha",
    });
    const arr = (filtered.json() as { audits: { tenantId: string }[] }).audits;
    expect(arr).toHaveLength(1);
    expect(arr[0]?.tenantId).toBe("alpha");
  });

  it("GET /audits/:id returns the record or 404", async () => {
    const run = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: { profileId: "sits", tenantId: "t1", auditId: "fixed-id-1" },
    });
    expect(run.statusCode).toBe(200);

    const got = await app.inject({
      method: "GET",
      url: "/audits/fixed-id-1",
    });
    expect(got.statusCode).toBe(200);
    expect((got.json() as { auditId: string }).auditId).toBe("fixed-id-1");

    const missing = await app.inject({
      method: "GET",
      url: "/audits/does-not-exist",
    });
    expect(missing.statusCode).toBe(404);
  });

  it("POST /audits/run with adapter wired runs Fn rules without warning", async () => {
    // sits-file is stubbed to yield empty pages, but plugging it in proves
    // the end-to-end wiring — the engine accepts the adapter and runs the
    // Fn pass instead of emitting the 'no source' warning.
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: {
        profileId: "hesa-tdp",
        tenantId: "t-with-source",
        adapterId: "sits-file",
        adapterConfig: { rootPath: "/tmp/databridge-test" },
        resourceMap: { STU: "Student" },
      },
    });
    expect(res.statusCode).toBe(200);
    const rec = res.json() as {
      status: string;
      report: { rulesFn: number; rowsScanned: number; warnings: string[] };
    };
    expect(rec.status).toBe("succeeded");
    expect(rec.report.rulesFn).toBeGreaterThan(0);
    // No warning because a source was supplied.
    expect(rec.report.warnings.some((w) => w.includes("no source"))).toBe(false);
  });

  it("POST /audits/run with unknown adapter returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: {
        profileId: "sits",
        tenantId: "t1",
        adapterId: "does-not-exist",
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("adapter_init_failed");
  });

  it("POST /audits/run honours caller-supplied auditId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/audits/run",
      payload: {
        profileId: "sits",
        tenantId: "t1",
        auditId: "custom-audit-xyz",
      },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { auditId: string }).auditId).toBe("custom-audit-xyz");
  });
});
