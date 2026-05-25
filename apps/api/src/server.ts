/**
 * DATABRIDGE API — Fastify gateway.
 *
 * Phase B wires the adapter registry, profile registry, and canonical-model
 * descriptor routes onto the bootstrap stub from Phase A. Auth + mapping
 * studio land in subsequent phases.
 */
import Fastify, { type FastifyInstance } from "fastify";
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { pinoRedactConfig } from "@databridge/platform";
import { registerAuth, JoseJwtValidator, type TokenValidator } from "./middleware/auth.js";
import { adapterRoutes } from "./routes/adapters.js";
import { profileRoutes } from "./routes/profiles.js";
import { canonicalRoutes } from "./routes/canonical.js";

const PORT = Number(process.env["API_PORT"] ?? 3001);
const HOST = process.env["API_HOST"] ?? "0.0.0.0";

export async function build(): Promise<FastifyInstance> {
  const isProd = process.env["NODE_ENV"] === "production";
  const loggerConfig: Record<string, unknown> = {
    level: process.env["LOG_LEVEL"] ?? "info",
    // PII redaction at the logger boundary — every log statement runs through this.
    // Covers email, names, dob, postcodes, phones, NHS numbers, NI numbers, etc.
    redact: pinoRedactConfig,
  };
  if (!isProd) {
    loggerConfig["transport"] = {
      target: "pino-pretty",
      options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
    };
  }
  const app = Fastify({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: loggerConfig as any,
  });

  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true });

  // OIDC auth wiring — opt-in via OIDC_ISSUER + OIDC_AUDIENCE env vars.
  // When absent, auth is disabled (suitable for local dev and the current
  // pre-prod posture). When set, the api requires a bearer JWT on all routes
  // except /, /healthz, /readyz.
  const oidcIssuer = process.env["OIDC_ISSUER"];
  const oidcAudience = process.env["OIDC_AUDIENCE"];
  if (oidcIssuer && oidcAudience) {
    const validator: TokenValidator = new JoseJwtValidator({
      issuer: oidcIssuer,
      audience: oidcAudience,
      ...(process.env["OIDC_JWKS_URI"] !== undefined
        ? { jwksUri: process.env["OIDC_JWKS_URI"] as string }
        : {}),
    });
    await registerAuth(app, { validator });
    app.log.info({ issuer: oidcIssuer }, "OIDC auth enabled");
  } else {
    app.log.warn("OIDC auth disabled (OIDC_ISSUER / OIDC_AUDIENCE not set)");
  }

  // Liveness / readiness
  app.get("/healthz", async () => ({ ok: true, ts: new Date().toISOString() }));
  app.get("/readyz", async () => ({ ok: true }));
  app.get("/", async () => ({
    name: "@databridge/api",
    version: "0.1.0",
    routes: [
      "/healthz",
      "/readyz",
      "/adapters",
      "/adapters/:id",
      "/profiles",
      "/profiles/:id",
      "/canonical/entities",
      "/canonical/entities/:name",
    ],
  }));

  await app.register(adapterRoutes);
  await app.register(profileRoutes);
  await app.register(canonicalRoutes);

  return app;
}

async function main(): Promise<void> {
  const app = await build();
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info({ port: PORT, host: HOST }, "databridge-api listening");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Auto-start only when run as an executable (node dist/server.js or tsx).
const argv1 = process.argv[1] ?? "";
if (argv1.endsWith("server.js") || argv1.endsWith("server.ts")) {
  void main();
} else if (process.env["DATABRIDGE_API_AUTOSTART"] === "1") {
  void main();
}
