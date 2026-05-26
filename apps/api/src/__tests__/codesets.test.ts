import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { build } from "../server.js";

describe("apps/api /codesets (Phase H)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET / advertises codeset routes in the catalogue", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    const body = res.json() as { routes: string[] };
    expect(body.routes).toContain("/codesets");
    expect(body.routes).toContain("/codesets/bundles");
    expect(body.routes).toContain("/codesets/:id");
  });

  it("GET /codesets/bundles lists the three seed bundles", async () => {
    const res = await app.inject({ method: "GET", url: "/codesets/bundles" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { bundles: Array<{ id: string; codeListCount: number }> };
    expect(body.bundles.map((b) => b.id).sort()).toEqual(["banner", "hesa", "sits"]);
    for (const b of body.bundles) {
      expect(b.codeListCount).toBeGreaterThan(0);
    }
  });

  it("GET /codesets lists every CodeList summary across bundles", async () => {
    const res = await app.inject({ method: "GET", url: "/codesets" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { codesets: Array<{ id: string; entryCount: number }> };
    const ids = body.codesets.map((c) => c.id);
    expect(ids).toContain("HESA.SEXID");
    expect(ids).toContain("SITS.NAT");
    expect(ids).toContain("BANNER.STVTERM");
    expect(body.codesets.length).toBeGreaterThanOrEqual(24);
  });

  it("GET /codesets/HESA.SEXID returns the full CodeList", async () => {
    const res = await app.inject({ method: "GET", url: "/codesets/HESA.SEXID" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; entries: Array<{ code: string; description: string }> };
    expect(body.id).toBe("HESA.SEXID");
    expect(body.entries.find((e) => e.code === "1")?.description).toBe("Female");
  });

  it("GET /codesets/does-not-exist returns 404", async () => {
    const res = await app.inject({ method: "GET", url: "/codesets/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe("codeset_not_found");
  });
});
