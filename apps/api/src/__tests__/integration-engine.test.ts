/**
 * Phase I — apps/api integration-engine route smoke tests.
 *
 * One test file covering all four new route groups:
 *   POST /identity/reconcile
 *   GET  /codeset-maps, /codeset-maps/:id, POST /codeset-maps/translate
 *   POST /effective-dating/resolve
 *   POST /reconciliation/report
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { build } from "../server.js";

describe("apps/api Phase I — integration-engine routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET / catalogue advertises every new Phase I route", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    const body = res.json() as { routes: string[] };
    for (const r of [
      "/identity/reconcile",
      "/codeset-maps",
      "/codeset-maps/:id",
      "/codeset-maps/translate",
      "/effective-dating/resolve",
      "/reconciliation/report",
    ]) {
      expect(body.routes).toContain(r);
    }
  });

  describe("POST /identity/reconcile", () => {
    it("returns exact-policy candidates on shared husid", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/identity/reconcile",
        payload: {
          incoming: [
            {
              system: "banner",
              sourceId: "B-1",
              husid: "1234567890123",
              firstName: "A",
              lastName: "B",
            },
          ],
          existing: [
            {
              system: "sits",
              sourceId: "S-1",
              husid: "1234567890123",
              firstName: "A",
              lastName: "B",
            },
          ],
          policy: { kind: "exact" },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        candidates: Array<{ score: number; confidence: string }>;
        counts: { generated: number };
      };
      expect(body.counts.generated).toBe(1);
      expect(body.candidates[0]?.score).toBe(1);
      expect(body.candidates[0]?.confidence).toBe("confident");
    });

    it("returns 400 for invalid body shape", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/identity/reconcile",
        payload: { incoming: [{ system: "banner" }], existing: [], policy: { kind: "exact" } },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /codeset-maps", () => {
    it("lists every bundled-default map", async () => {
      const res = await app.inject({ method: "GET", url: "/codeset-maps" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { maps: Array<{ id: string; sourceCodelist: string }> };
      expect(body.maps.length).toBeGreaterThanOrEqual(8);
      const ids = body.maps.map((m) => m.id);
      expect(ids).toContain("banner-stvresd-to-hesa-feestatus@1.0.0");
      expect(ids).toContain("hesa-hecos-to-us-cip@1.0.0");
    });

    it("GET /codeset-maps/:id returns the full map", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/codeset-maps/banner-stvresd-to-hesa-feestatus@1.0.0",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { sourceCodelist: string; entries: unknown[] };
      expect(body.sourceCodelist).toBe("STVRESD");
      expect(body.entries.length).toBeGreaterThan(0);
    });

    it("GET /codeset-maps/:id returns 404 for unknown id", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/codeset-maps/does-not-exist",
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /codeset-maps/translate", () => {
    it("translates STVRESD H → FEESTATUS 01", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/codeset-maps/translate",
        payload: {
          sourceCodelist: "STVRESD",
          targetCodelist: "FEESTATUS",
          sourceCode: "H",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean; targetCode: string };
      expect(body.ok).toBe(true);
      expect(body.targetCode).toBe("01");
    });

    it("returns ok=false with unmappedReason for unknown source code", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/codeset-maps/translate",
        payload: {
          sourceCodelist: "STVRESD",
          targetCodelist: "FEESTATUS",
          sourceCode: "ZZ",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean; unmappedReason: string };
      expect(body.ok).toBe(false);
      expect(body.unmappedReason).toContain("ZZ");
    });
  });

  describe("POST /effective-dating/resolve", () => {
    it("resolves activity-dated rows to the most-recent row before `at`", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/effective-dating/resolve",
        payload: {
          pattern: "activity-dated",
          rows: [
            { activityDate: "2024-01-01", v: "old" },
            { activityDate: "2025-06-15", v: "current" },
          ],
          at: "2025-12-31",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        resolved: { row: { v: string }; effectiveDating: { pattern: string } };
      };
      expect(body.resolved.row.v).toBe("current");
      expect(body.resolved.effectiveDating.pattern).toBe("activity-dated");
    });

    it("returns 400 when status-driven called without statusArgs", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/effective-dating/resolve",
        payload: { pattern: "status-driven", rows: [] },
      });
      expect(res.statusCode).toBe(400);
    });

    it("resolves snapshot trivially", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/effective-dating/resolve",
        payload: { pattern: "snapshot", rows: [{ v: "only" }] },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { resolved: { row: { v: string } } };
      expect(body.resolved.row.v).toBe("only");
    });
  });

  describe("POST /reconciliation/report", () => {
    it("returns counts and per-pair detail for matched + only sets", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/reconciliation/report",
        payload: {
          systemA: "banner",
          systemB: "sits",
          sourceA: [
            {
              system: "banner",
              sourceId: "B-1",
              husid: "1234567890123",
              firstName: "A",
              lastName: "B",
            },
            {
              system: "banner",
              sourceId: "B-2",
              husid: "9999999999999",
              firstName: "C",
              lastName: "D",
            },
          ],
          sourceB: [
            {
              system: "sits",
              sourceId: "S-1",
              husid: "1234567890123",
              firstName: "A",
              lastName: "B",
            },
            {
              system: "sits",
              sourceId: "S-2",
              husid: "8888888888888",
              firstName: "X",
              lastName: "Y",
            },
          ],
          policy: { kind: "exact" },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        counts: {
          matched: number;
          sourceAOnly: number;
          sourceBOnly: number;
          totalA: number;
          totalB: number;
        };
      };
      expect(body.counts.matched).toBe(1);
      expect(body.counts.sourceAOnly).toBe(1);
      expect(body.counts.sourceBOnly).toBe(1);
      expect(body.counts.totalA).toBe(2);
      expect(body.counts.totalB).toBe(2);
    });
  });
});
