import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { build } from "../server.js";

describe("apps/api /rule-packs (Phase H)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET / advertises rule-pack routes in the catalogue", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    const body = res.json() as { routes: string[] };
    expect(body.routes).toContain("/rule-packs");
    expect(body.routes).toContain("/rule-packs/:id");
  });

  it("GET /rule-packs lists both native packs", async () => {
    const res = await app.inject({ method: "GET", url: "/rule-packs" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rulePacks: Array<{ id: string; ruleCount: number }> };
    const byId = Object.fromEntries(body.rulePacks.map((p) => [p.id, p]));
    expect(byId["sits-native"]?.ruleCount).toBe(10);
    expect(byId["banner-native"]?.ruleCount).toBe(10);
  });

  it("GET /rule-packs/sits-native returns full rule list", async () => {
    const res = await app.inject({ method: "GET", url: "/rule-packs/sits-native" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      id: string;
      family: string;
      rules: Array<{ id: string; family: string }>;
    };
    expect(body.id).toBe("sits-native");
    expect(body.family).toBe("SITS-INTEGRITY");
    expect(body.rules).toHaveLength(10);
    expect(body.rules.every((r) => r.family === "SITS-INTEGRITY")).toBe(true);
  });

  it("GET /rule-packs/banner-native returns full rule list", async () => {
    const res = await app.inject({ method: "GET", url: "/rule-packs/banner-native" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; rules: Array<{ id: string }> };
    expect(body.id).toBe("banner-native");
    expect(body.rules.map((r) => r.id)).toEqual(
      expect.arrayContaining(["BANNER-NAT-01", "BANNER-NAT-10"])
    );
  });

  it("GET /rule-packs/does-not-exist returns 404", async () => {
    const res = await app.inject({ method: "GET", url: "/rule-packs/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe("rule_pack_not_found");
  });
});
