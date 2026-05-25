/**
 * Auth middleware tests — exercise the OIDC scaffold without a live IdP by
 * injecting a TokenValidator stub.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  registerAuth,
  requireRole,
  mapClaimsToPrincipal,
  AuthError,
  type TokenValidator,
  type DataBridgePrincipal,
} from "../middleware/auth.js";

function buildAppWithAuth(validator: TokenValidator, opts?: { disabled?: boolean }): Promise<FastifyInstance> {
  const app = Fastify();
  return (async () => {
    await registerAuth(app, {
      validator,
      ...(opts?.disabled !== undefined ? { disabled: opts.disabled } : {}),
    });
    app.get("/", async () => ({ ok: true }));
    app.get("/healthz", async () => ({ ok: true }));
    app.get("/me", async (req) => ({ principal: req.principal }));
    app.get(
      "/tenants/:tenantId/secret",
      { preHandler: requireRole({ resolveTenantId: (r) => (r.params as { tenantId: string }).tenantId, anyOf: ["data:viewer"] }) },
      async (req) => ({
        tenant: (req.params as { tenantId: string }).tenantId,
        sub: req.principal?.sub,
      }),
    );
    return app;
  })();
}

const principalA: DataBridgePrincipal = {
  sub: "user-a",
  email: "a@example.com",
  name: "Alice",
  tenants: [{ tenantId: "t1", roles: ["data:viewer"] }],
  rawClaims: {},
};

describe("mapClaimsToPrincipal", () => {
  it("extracts sub, email, name, tenants, roles", () => {
    const p = mapClaimsToPrincipal({
      sub: "u1",
      email: "u1@x",
      name: "U1",
      tenants: [{ tenantId: "t1", roles: ["data:viewer", "tenant:admin"] }],
    });
    expect(p.sub).toBe("u1");
    expect(p.tenants[0]?.roles).toEqual(["data:viewer", "tenant:admin"]);
  });

  it("ignores unknown role strings unless mapped", () => {
    const p = mapClaimsToPrincipal(
      {
        sub: "u1",
        tenants: [{ tenantId: "t1", roles: ["viewer", "made-up"] }],
      },
      { viewer: "data:viewer" },
    );
    expect(p.tenants[0]?.roles).toEqual(["data:viewer"]);
  });

  it("throws when sub is missing", () => {
    expect(() => mapClaimsToPrincipal({})).toThrow(AuthError);
  });
});

describe("registerAuth preHandler", () => {
  let app: FastifyInstance;
  const validator: TokenValidator = {
    validate: vi.fn(async (token: string) => {
      if (token === "good") return principalA;
      throw new AuthError("bad token", 401);
    }),
  };

  beforeAll(async () => {
    app = await buildAppWithAuth(validator);
  });
  afterAll(async () => {
    await app.close();
  });

  it("public paths (/, /healthz) bypass auth", async () => {
    expect((await app.inject({ method: "GET", url: "/" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
  });

  it("401 when Authorization header is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: /missing bearer/i });
  });

  it("401 when token validation throws", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer bad" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("attaches principal on success", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer good" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ principal: { sub: "user-a" } });
  });
});

describe("registerAuth disabled mode", () => {
  it("skips validator entirely when disabled=true", async () => {
    const validate = vi.fn();
    const app = await buildAppWithAuth({ validate } as TokenValidator, { disabled: true });
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(200);
    expect(validate).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("requireRole RBAC", () => {
  let app: FastifyInstance;
  const validator: TokenValidator = {
    validate: async (token) => {
      if (token === "viewer") return principalA;
      if (token === "admin") {
        return {
          ...principalA,
          sub: "user-admin",
          tenants: [{ tenantId: "t1", roles: ["tenant:admin"] }],
        };
      }
      if (token === "super") {
        return {
          ...principalA,
          sub: "god",
          tenants: [{ tenantId: "other", roles: ["system:superadmin"] }],
        };
      }
      throw new AuthError("bad", 401);
    },
  };

  beforeAll(async () => {
    app = await buildAppWithAuth(validator);
  });
  afterAll(async () => {
    await app.close();
  });

  it("allows when principal has required role in the right tenant", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/tenants/t1/secret",
      headers: { authorization: "Bearer viewer" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tenant: "t1", sub: "user-a" });
  });

  it("403 when principal lacks the required role", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/tenants/t1/secret",
      headers: { authorization: "Bearer admin" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: /insufficient role/ });
  });

  it("403 when principal has no membership in the tenant", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/tenants/other-tenant/secret",
      headers: { authorization: "Bearer viewer" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: /no membership/ });
  });

  it("system:superadmin satisfies any role check across tenants", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/tenants/t1/secret",
      headers: { authorization: "Bearer super" },
    });
    expect(res.statusCode).toBe(200);
  });
});
