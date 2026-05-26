/**
 * Phase J — apps/api migration routes smoke tests.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { build } from "../server.js";

describe("apps/api Phase J — migration routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET / catalogue advertises every Phase J route", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    const body = res.json() as { routes: string[] };
    for (const r of [
      "/migration/policy/parse",
      "/migration/policy/parse-partial",
      "/migration/run",
      "/migration/verify",
      "/migration/pre-flight",
      "/migration/pre-flight/bundles",
      "/migration/queue",
      "/migration/queue/enqueue",
      "/migration/queue/resolve",
      "/migration/queue/skip",
    ]) {
      expect(body.routes).toContain(r);
    }
  });

  describe("POST /migration/policy/parse-partial", () => {
    it("fills missing slots with defaults", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/migration/policy/parse-partial",
        payload: {
          bundle: {
            id: "smoke@1",
            sourceSystem: "banner",
            targetSystem: "sits",
          },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { policy: { id: string; crnGenerator: { strategy: string } } };
      expect(body.policy.id).toBe("smoke@1");
      expect(body.policy.crnGenerator.strategy).toBe("monotonic");
    });

    it("rejects bundle missing required headers", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/migration/policy/parse-partial",
        payload: { bundle: { id: "broken" } },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /migration/run", () => {
    it("dry-runs a stu row and returns provenance + no writes", async () => {
      const policyRes = await app.inject({
        method: "POST",
        url: "/migration/policy/parse-partial",
        payload: {
          bundle: { id: "run-smoke@1", sourceSystem: "banner", targetSystem: "sits" },
        },
      });
      const { policy } = policyRes.json() as { policy: unknown };
      const res = await app.inject({
        method: "POST",
        url: "/migration/run",
        payload: {
          policy,
          rows: [
            {
              entity: "stu",
              data: { stu_code: "S0001", stu_surn: "Smith", stu_fnm1: "Alex" },
            },
          ],
          dryRun: true,
          migrationRunId: "smoke-1",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        report: {
          dryRun: boolean;
          totals: { sourceRowCount: number };
          diffs: { op: string }[];
        };
      };
      expect(body.report.dryRun).toBe(true);
      expect(body.report.totals.sourceRowCount).toBe(1);
      expect(body.report.diffs.length).toBe(1);
    });

    it("rejects an invalid policy", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/migration/run",
        payload: { policy: { id: "x" }, rows: [] },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /migration/verify", () => {
    it("computes DHP and (optionally) emits CSV", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/migration/verify",
        payload: {
          a: [{ entity: "student", id: "S1", fields: { surname: "Smith" } }],
          b: [{ entity: "student", id: "S1", fields: { surname: "Smith" } }],
          emitCsv: true,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        report: { overallDhp: number };
        summary: string;
        csv?: string;
      };
      expect(body.report.overallDhp).toBe(1);
      expect(body.summary).toContain("DHP overall=100.0%");
      expect(body.csv).toContain("entity,id,field,status,a,b");
    });
  });

  describe("POST /migration/pre-flight", () => {
    it("passes when declared fields cover the requirement bundle", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/migration/pre-flight",
        payload: {
          requirements: "banner-uk-classification",
          declared: [{ table: "SHRDGMR", field: "INST_HONOR" }],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { report: { passed: boolean }; summary: string };
      expect(body.report.passed).toBe(true);
      expect(body.summary).toContain("PASS");
    });

    it("flags missing fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/migration/pre-flight",
        payload: {
          requirements: "banner-uk-classification",
          declared: [],
        },
      });
      const body = res.json() as { report: { passed: boolean; missing: number } };
      expect(body.report.passed).toBe(false);
      expect(body.report.missing).toBe(1);
    });

    it("rejects unknown requirement bundle", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/migration/pre-flight",
        payload: { requirements: "no-such-bundle", declared: [] },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("Queue lifecycle", () => {
    it("enqueue → list → resolve flow", async () => {
      const e = await app.inject({
        method: "POST",
        url: "/migration/queue/enqueue",
        payload: { entity: "scj", field: "scj_hiqp", reason: "gap" },
      });
      expect(e.statusCode).toBe(200);
      const { item } = e.json() as { item: { id: string; status: string } };
      expect(item.status).toBe("open");

      const list = await app.inject({ method: "GET", url: "/migration/queue?status=open" });
      const listBody = list.json() as { items: { id: string }[] };
      expect(listBody.items.some((it) => it.id === item.id)).toBe(true);

      const r = await app.inject({
        method: "POST",
        url: "/migration/queue/resolve",
        payload: { id: item.id, value: "Y", resolvedBy: "test" },
      });
      const resolved = r.json() as { item: { status: string; value: string } };
      expect(resolved.item.status).toBe("resolved");
      expect(resolved.item.value).toBe("Y");
    });

    it("resolve unknown id returns 409", async () => {
      const r = await app.inject({
        method: "POST",
        url: "/migration/queue/resolve",
        payload: { id: "oiq-9999", value: "x", resolvedBy: "u" },
      });
      expect(r.statusCode).toBe(409);
    });
  });
});
