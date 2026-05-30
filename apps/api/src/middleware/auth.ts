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
    public readonly statusCode: 401 | 403 = 401
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
    opts: { issuer: string; audience: string }
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
          `Underlying error: ${(err as Error).message}`
      );
    }
  }

  private async ensureKeySet(): Promise<unknown> {
    if (this.keyset) return this.keyset;
    const jose = await this.loadJose();
    const jwksUri =
      this.opts.jwksUri ?? `${this.opts.issuer.replace(/\/$/, "")}/.well-known/jwks.json`;
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
  roleMap?: Readonly<Record<string, DatabridgeRole>>
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

/**
 * Process-wide flag set by registerAuth. requireRole consults this so that
 * route preHandlers become no-ops when no auth scheme is wired — the
 * existing posture for local dev. When auth IS wired the global preHandler
 * has already either attached a principal or rejected the request, so
 * requireRole can safely assume req.principal is present.
 */
let authActive = false;

/** Test helper: clear the global flag between Fastify instances. */
export function _resetAuthActiveForTests(): void {
  authActive = false;
}

export async function registerAuth(
  app: FastifyInstance,
  config: AuthMiddlewareConfig
): Promise<void> {
  const publicPaths = new Set<string>(config.publicPaths ?? DEFAULT_PUBLIC_PATHS);
  if (!config.disabled) authActive = true;

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
    // When no auth scheme is wired (local dev), RBAC is meaningless — skip.
    if (!authActive) return;
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
          403
        )
      );
    }
  };
}

// -----------------------------------------------------------------------------
// Static-token validator (non-OIDC environments: CI, staging, CLI fixtures)
// -----------------------------------------------------------------------------

/**
 * One entry in the static token table. The validator matches the raw bearer
 * token against `token` and synthesises a principal with the given tenant
 * memberships.
 */
export interface StaticTokenEntry {
  /** Opaque bearer token string the client sends. */
  token: string;
  /** Subject identifier surfaced on req.principal.sub. */
  sub: string;
  /** Tenant memberships granted by this token. */
  tenants: ReadonlyArray<{ tenantId: string; roles: DatabridgeRole[] }>;
  /** Optional email/name surfaced on the principal (purely for logs/UI). */
  email?: string;
  name?: string;
}

export interface StaticTokenValidatorOptions {
  entries: ReadonlyArray<StaticTokenEntry>;
}

/**
 * In-memory bearer-token validator. Intended for environments that don't run
 * a full OIDC provider (local dev with auth-on, CI, smoke tests, the CLI
 * pushing audits at a managed staging API). The token list is loaded from
 * `DATABRIDGE_API_TOKENS` env var at server startup; see
 * `parseStaticTokensEnv` for the wire format.
 *
 * Security posture: tokens are opaque shared secrets. Compare in constant
 * time against the configured list. No persistence, no rotation hooks — for
 * production, prefer OIDC.
 */
export class StaticTokenValidator implements TokenValidator {
  private readonly byToken: ReadonlyMap<string, StaticTokenEntry>;

  constructor(opts: StaticTokenValidatorOptions) {
    const map = new Map<string, StaticTokenEntry>();
    for (const e of opts.entries) {
      if (!e.token) continue;
      map.set(e.token, e);
    }
    this.byToken = map;
  }

  async validate(token: string): Promise<DataBridgePrincipal> {
    // Constant-time compare across all known tokens. We touch every entry so
    // a timing side channel can't probe individual tokens.
    let matched: StaticTokenEntry | undefined;
    for (const [candidate, entry] of this.byToken.entries()) {
      if (constantTimeEqual(token, candidate)) {
        matched = entry;
      }
    }
    if (!matched) throw new AuthError("invalid bearer token", 401);
    return {
      sub: matched.sub,
      email: matched.email,
      name: matched.name,
      tenants: matched.tenants.map((t) => ({
        tenantId: t.tenantId,
        roles: [...t.roles],
      })),
      rawClaims: { auth: "static-token", sub: matched.sub },
    };
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  // Length differences leak via short-circuit; XOR into accumulator and
  // mask the length check at the end.
  const al = a.length;
  const bl = b.length;
  const max = Math.max(al, bl);
  let diff = al ^ bl;
  for (let i = 0; i < max; i++) {
    const ca = i < al ? a.charCodeAt(i) : 0;
    const cb = i < bl ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

/**
 * Parse the `DATABRIDGE_API_TOKENS` env var wire format. Format (semicolon
 * separates entries, comma separates fields, `:` separates tenant from
 * role list, `+` separates multiple roles in the role list, `|` separates
 * multiple tenant memberships):
 *
 *   <token>=<sub>,<tenantId>:<role>[+<role>...][|<tenantId>:<role>...][,...]
 *
 * Example:
 *   tok-alice=alice,t1:data:viewer+audit:viewer|t2:data:viewer
 *   tok-ci=ci-bot,*:system:superadmin
 *
 * The `*` tenant id is rewritten to grant `system:superadmin` in a synthetic
 * `*` tenant — combined with the existing requireRole superadmin bypass this
 * effectively grants global access.
 *
 * Returns the parsed entries; throws when the format is malformed so the
 * server fails closed at startup rather than silently disabling auth.
 */
export function parseStaticTokensEnv(raw: string): StaticTokenEntry[] {
  const entries: StaticTokenEntry[] = [];
  const parts = raw
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 1) {
      throw new Error(
        `DATABRIDGE_API_TOKENS: expected '<token>=<sub>,<tenant>:<role>'; got ${JSON.stringify(part)}`
      );
    }
    const token = part.slice(0, eq).trim();
    const rest = part.slice(eq + 1).trim();
    const firstComma = rest.indexOf(",");
    if (firstComma < 0) {
      throw new Error(`DATABRIDGE_API_TOKENS: entry for token ${token} missing tenant assignments`);
    }
    const sub = rest.slice(0, firstComma).trim();
    const tenantsRaw = rest.slice(firstComma + 1).trim();
    if (!sub) {
      throw new Error(`DATABRIDGE_API_TOKENS: entry for token ${token} missing sub`);
    }
    if (!tenantsRaw) {
      throw new Error(`DATABRIDGE_API_TOKENS: entry for token ${token} missing tenant assignments`);
    }
    const tenants: Array<{ tenantId: string; roles: DatabridgeRole[] }> = [];
    for (const t of tenantsRaw
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)) {
      const colon = t.indexOf(":");
      if (colon < 1) {
        throw new Error(
          `DATABRIDGE_API_TOKENS: tenant entry ${JSON.stringify(t)} missing role list`
        );
      }
      const tenantId = t.slice(0, colon).trim();
      const rolesRaw = t.slice(colon + 1).trim();
      const roles: DatabridgeRole[] = [];
      for (const r of rolesRaw
        .split("+")
        .map((s) => s.trim())
        .filter(Boolean)) {
        if (!ALL_ROLES.has(r as DatabridgeRole)) {
          throw new Error(
            `DATABRIDGE_API_TOKENS: unknown role ${JSON.stringify(r)} for tenant ${tenantId}`
          );
        }
        roles.push(r as DatabridgeRole);
      }
      tenants.push({ tenantId, roles });
    }
    entries.push({ token, sub, tenants });
  }
  return entries;
}
