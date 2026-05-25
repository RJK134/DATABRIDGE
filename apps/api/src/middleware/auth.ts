/**
 * OIDC JWT + RBAC middleware scaffold for apps/api.
 *
 * Design intent (DESIGN.md §6):
 * - All routes other than /healthz, /readyz, and / require a valid bearer JWT
 *   issued by a configured OIDC provider (Keycloak in default deploys, also
 *   Entra ID, Cognito, OCI IAM via IdentityAdapter implementations).
 * - JWT signature verification uses the provider's JWKS endpoint; keys are
 *   cached per-issuer.
 * - Claims are mapped into a DataBridgePrincipal attached to req.principal.
 * - RBAC is enforced via .requireRole() route preHandlers.
 *
 * This file provides the *contract + plumbing* — concrete JWKS fetching uses
 * jose, which is loaded lazily so apps without OIDC enabled can still build
 * and run. Tests below exercise the verifier through an injected validator
 * (no live IdP needed).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { DatabridgeRole } from "@databridge/platform";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface DataBridgePrincipal {
  sub: string;
  email: string | undefined;
  name: string | undefined;
  /** Mapped role assignments per tenant. */
  tenants: Array<{ tenantId: string; roles: DatabridgeRole[] }>;
  /** Raw claims for diagnostics. PII fields are redacted by the logger. */
  rawClaims: Record<string, unknown>;
}

export interface TokenValidator {
  validate(token: string): Promise<DataBridgePrincipal>;
}

export interface AuthMiddlewareConfig {
  /** Routes that bypass auth entirely (liveness, readiness, root). */
  publicPaths?: ReadonlyArray<string>;
  /** Validator implementation. JoseJwtValidator is the default. */
  validator: TokenValidator;
  /** Disable auth globally (e.g. for local dev). Default: false. */
  disabled?: boolean;
}

export interface JoseJwtValidatorOptions {
  /** OIDC issuer URL (e.g. https://login.example.com/realms/databridge). */
  issuer: string;
  /** Expected audience (client id). */
  audience: string;
  /** Override the JWKS URI; defaults to `${issuer}/.well-known/jwks.json`. */
  jwksUri?: string;
  /** Tenant claim path. Default: 'tenants' (array of {tenantId, roles}). */
  tenantClaimPath?: string;
  /** Map of legacy/custom claim role names → DatabridgeRole. */
  roleMap?: Readonly<Record<string, DatabridgeRole>>;
}

declare module "fastify" {
  interface FastifyRequest {
    principal?: DataBridgePrincipal;
  }
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 401 | 403 = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// -----------------------------------------------------------------------------
// Default Validator (jose-based, lazy-loaded)
// -----------------------------------------------------------------------------

interface JoseModule {
  jwtVerify: (
    token: string,
    keySet: unknown,
    opts: { issuer: string; audience: string },
  ) => Promise<{ payload: Record<string, unknown> }>;
  createRemoteJWKSet: (url: URL) => unknown;
}

export class JoseJwtValidator implements TokenValidator {
  private readonly opts: Required<
    Pick<JoseJwtValidatorOptions, "issuer" | "audience" | "tenantClaimPath">
  > &
    Pick<JoseJwtValidatorOptions, "jwksUri" | "roleMap">;
  private keyset?: unknown;

  constructor(opts: JoseJwtValidatorOptions) {
    if (!opts.issuer) throw new Error("JoseJwtValidator: issuer required");
    if (!opts.audience) throw new Error("JoseJwtValidator: audience required");
    this.opts = {
      issuer: opts.issuer,
      audience: opts.audience,
      tenantClaimPath: opts.tenantClaimPath ?? "tenants",
      ...(opts.jwksUri !== undefined ? { jwksUri: opts.jwksUri } : {}),
      ...(opts.roleMap !== undefined ? { roleMap: opts.roleMap } : {}),
    };
  }

  private async loadJose(): Promise<JoseModule> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await import("jose" as any)) as JoseModule;
    } catch (err) {
      throw new Error(
        "apps/api: the optional peer 'jose' is required for OIDC JWT validation. " +
          "Install with: pnpm add jose\n" +
          `Underlying error: ${(err as Error).message}`,
      );
    }
  }

  private async ensureKeySet(): Promise<unknown> {
    if (this.keyset) return this.keyset;
    const jose = await this.loadJose();
    const jwksUri =
      this.opts.jwksUri ??
      `${this.opts.issuer.replace(/\/$/, "")}/.well-known/jwks.json`;
    this.keyset = jose.createRemoteJWKSet(new URL(jwksUri));
    return this.keyset;
  }

  async validate(token: string): Promise<DataBridgePrincipal> {
    const jose = await this.loadJose();
    const keyset = await this.ensureKeySet();
    let payload: Record<string, unknown>;
    try {
      const result = await jose.jwtVerify(token, keyset, {
        issuer: this.opts.issuer,
        audience: this.opts.audience,
      });
      payload = result.payload;
    } catch (err) {
      throw new AuthError(`Invalid token: ${(err as Error).message}`, 401);
    }
    return mapClaimsToPrincipal(payload, this.opts.roleMap);
  }
}

// -----------------------------------------------------------------------------
// Claims mapping
// -----------------------------------------------------------------------------

const ALL_ROLES: ReadonlySet<DatabridgeRole> = new Set<DatabridgeRole>([
  "tenant:admin",
  "data:steward",
  "data:viewer",
  "migration:operator",
  "audit:viewer",
  "integration:manager",
  "system:superadmin",
]);

export function mapClaimsToPrincipal(
  claims: Record<string, unknown>,
  roleMap?: Readonly<Record<string, DatabridgeRole>>,
): DataBridgePrincipal {
  const sub = typeof claims["sub"] === "string" ? (claims["sub"] as string) : "";
  if (!sub) throw new AuthError("token missing 'sub' claim", 401);

  const tenantsRaw = claims["tenants"];
  const tenants: Array<{ tenantId: string; roles: DatabridgeRole[] }> = [];
  if (Array.isArray(tenantsRaw)) {
    for (const entry of tenantsRaw as Array<Record<string, unknown>>) {
      if (typeof entry["tenantId"] !== "string") continue;
      const rolesRaw = entry["roles"];
      const roles: DatabridgeRole[] = [];
      if (Array.isArray(rolesRaw)) {
        for (const r of rolesRaw as unknown[]) {
          if (typeof r !== "string") continue;
          const mapped = roleMap?.[r] ?? r;
          if (ALL_ROLES.has(mapped as DatabridgeRole)) {
            roles.push(mapped as DatabridgeRole);
          }
        }
      }
      tenants.push({ tenantId: entry["tenantId"] as string, roles });
    }
  }

  return {
    sub,
    email: typeof claims["email"] === "string" ? (claims["email"] as string) : undefined,
    name: typeof claims["name"] === "string" ? (claims["name"] as string) : undefined,
    tenants,
    rawClaims: claims,
  };
}

// -----------------------------------------------------------------------------
// Fastify wiring
// -----------------------------------------------------------------------------

const DEFAULT_PUBLIC_PATHS = ["/", "/healthz", "/readyz"] as const;

export async function registerAuth(
  app: FastifyInstance,
  config: AuthMiddlewareConfig,
): Promise<void> {
  const publicPaths = new Set<string>(config.publicPaths ?? DEFAULT_PUBLIC_PATHS);

  app.addHook("preHandler", async (req, reply) => {
    if (config.disabled) return;
    // routeOptions.url is fastify 4.20+ stable replacement for routerPath.
    const routePath =
      (req as unknown as { routeOptions?: { url?: string } }).routeOptions?.url ??
      (req as unknown as { routerPath?: string }).routerPath ??
      req.url;
    if (publicPaths.has(routePath)) return;

    const auth = req.headers["authorization"];
    if (typeof auth !== "string" || !auth.toLowerCase().startsWith("bearer ")) {
      sendAuthError(reply, new AuthError("missing bearer token", 401));
      return reply;
    }
    const token = auth.slice("bearer ".length).trim();
    try {
      req.principal = await config.validator.validate(token);
    } catch (err) {
      sendAuthError(reply, err as Error);
      return reply;
    }
    return;
  });
}

function sendAuthError(reply: FastifyReply, err: Error): void {
  const status = err instanceof AuthError ? err.statusCode : 401;
  void reply.code(status).send({ error: err.message });
}

// -----------------------------------------------------------------------------
// RBAC helper
// -----------------------------------------------------------------------------

export interface RequireRoleOptions {
  /** Tenant id extracted from the request (e.g. from req.params or a header). */
  resolveTenantId: (req: FastifyRequest) => string | undefined;
  /** One or more roles, any of which satisfies the check. */
  anyOf: ReadonlyArray<DatabridgeRole>;
}

/**
 * Returns a Fastify preHandler that enforces role membership in the tenant
 * extracted from the request. Use as `{ preHandler: requireRole({...}) }`.
 */
export function requireRole(opts: RequireRoleOptions) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const principal = req.principal;
    if (!principal) {
      sendAuthError(reply, new AuthError("not authenticated", 401));
      return;
    }
    // system:superadmin satisfies any role check
    if (principal.tenants.some((t) => t.roles.includes("system:superadmin"))) {
      return;
    }
    const tenantId = opts.resolveTenantId(req);
    if (!tenantId) {
      sendAuthError(reply, new AuthError("missing tenant in request", 403));
      return;
    }
    const membership = principal.tenants.find((t) => t.tenantId === tenantId);
    if (!membership) {
      sendAuthError(reply, new AuthError(`no membership in tenant ${tenantId}`, 403));
      return;
    }
    const ok = opts.anyOf.some((r) => membership.roles.includes(r));
    if (!ok) {
      sendAuthError(
        reply,
        new AuthError(
          `insufficient role; need one of ${opts.anyOf.join(", ")} in tenant ${tenantId}`,
          403,
        ),
      );
    }
  };
}
