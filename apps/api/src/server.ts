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
import {
  registerAuth,
  JoseJwtValidator,
  StaticTokenValidator,
  parseStaticTokensEnv,
  type TokenValidator,
} from "./middleware/auth.js";
import { adapterRoutes } from "./routes/adapters.js";
import { profileRoutes } from "./routes/profiles.js";
import { canonicalRoutes } from "./routes/canonical.js";
import { auditRoutes } from "./routes/audits.js";
import { rulePackRoutes } from "./routes/rule-packs.js";
import { codesetRoutes } from "./routes/codesets.js";
import { identityRoutes } from "./routes/identity.js";
import { codesetMappingRoutes } from "./routes/codeset-mapping.js";
import { effectiveDatingRoutes } from "./routes/effective-dating.js";
import { reconciliationRoutes } from "./routes/reconciliation.js";
import { migrationRoutes } from "./routes/migration.js";
import { findingsRoutes } from "./routes/findings.js";
import { rulesCompileRoutes } from "./routes/rules-compile.js";
import { findingsNarrateRoutes } from "./routes/findings-narrate.js";
import { setAuditStore } from "./audit-store.js";
import { createAuditStore } from "./audit-store-factory.js";
import { createAuditQueue, type AuditQueue } from "./audit-queue.js";
import { runAuditJob, type AuditRunnerLogger } from "./audit-runner.js";

const PORT = Number(process.env["API_PORT"] ?? 3001);
const HOST = process.env["API_HOST"] ?? "0.0.0.0";

export interface BuildOptions {
  /**
   * Override the audit queue. When omitted createAuditQueue() reads env.
   * Test fixtures use this to inject InProcessAuditQueue with a known
   * concurrency or to plug a fake.
   */
  auditQueue?: AuditQueue;
  /**
   * When true, POST /audits/run waits for the queued job to finish before
   * responding 200. Default false (returns 202). Tests flip this on.
   */
  awaitAuditCompletion?: boolean;
}

export async function build(options: BuildOptions = {}): Promise<FastifyInstance> {
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

  // Auth wiring resolves in priority order:
  //   1. OIDC (OIDC_ISSUER + OIDC_AUDIENCE) — production posture.
  //   2. Static bearer tokens (DATABRIDGE_API_TOKENS) — staging/CI/CLI.
  //   3. Disabled — local dev with no auth (logged as a warning).
  const oidcIssuer = process.env["OIDC_ISSUER"];
  const oidcAudience = process.env["OIDC_AUDIENCE"];
  const staticTokensRaw = process.env["DATABRIDGE_API_TOKENS"];
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
  } else if (staticTokensRaw) {
    const entries = parseStaticTokensEnv(staticTokensRaw);
    const validator: TokenValidator = new StaticTokenValidator({ entries });
    await registerAuth(app, { validator });
    app.log.info(
      { tokens: entries.length },
      "static bearer-token auth enabled (DATABRIDGE_API_TOKENS)"
    );
  } else {
    app.log.warn(
      "auth disabled (set OIDC_ISSUER+OIDC_AUDIENCE or DATABRIDGE_API_TOKENS to enable)"
    );
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
      "/audits",
      "/audits/run",
      "/audits/:id",
      "/rule-packs",
      "/rule-packs/:id",
      "/codesets",
      "/codesets/bundles",
      "/codesets/:id",
      "/identity/reconcile",
      "/codeset-maps",
      "/codeset-maps/:id",
      "/codeset-maps/translate",
      "/effective-dating/resolve",
      "/reconciliation/report",
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
      "/migration/targets",
      "/migration/land",
      "/findings/waivers",
      "/findings/waivers/ack",
      "/findings/waivers/waive",
      "/findings/waivers/revoke",
      "/findings/waivers/apply",
      "/findings/delta",
      "/findings/severity-by-surface",
      "/findings/reproduce",
    ],
  }));

  // Wire the persistent AuditStore if DATABASE_URL is set; otherwise the
  // in-memory default already installed at module load stays in place.
  const store = await createAuditStore({ logger: app.log });
  setAuditStore(store);

  // Audit queue — InProcessAuditQueue by default, PgBossAuditQueue when
  // AUDIT_QUEUE=pgboss + DATABASE_URL set. The worker side runs the actual
  // audits via runAuditJob. We pass a thin logger adapter so the runner's
  // logging matches the rest of the app.
  const runnerLogger: AuditRunnerLogger = {
    info: (msg, meta) => app.log.info(meta ?? {}, msg),
    warn: (msg, meta) => app.log.warn(meta ?? {}, msg),
    error: (msg, meta) => app.log.error(meta ?? {}, msg),
    debug: (msg, meta) => app.log.debug(meta ?? {}, msg),
    child: (bindings) => {
      const child = app.log.child(bindings);
      return {
        info: (m, meta) => child.info(meta ?? {}, m),
        warn: (m, meta) => child.warn(meta ?? {}, m),
        error: (m, meta) => child.error(meta ?? {}, m),
        debug: (m, meta) => child.debug(meta ?? {}, m),
      };
    },
  };
  const queue = options.auditQueue ?? createAuditQueue({ logger: runnerLogger });
  await queue.startWorker(async (job) => {
    await runAuditJob(job, runnerLogger);
  });
  // Shut the queue down with the server so tests don't leak handlers.
  app.addHook("onClose", async () => {
    await queue.shutdown();
  });

  await app.register(adapterRoutes);
  await app.register(profileRoutes);
  await app.register(canonicalRoutes);
  await app.register(auditRoutes, {
    queue,
    awaitCompletion: options.awaitAuditCompletion ?? false,
  });
  await app.register(rulePackRoutes);
  await app.register(codesetRoutes);
  await app.register(identityRoutes);
  await app.register(codesetMappingRoutes);
  await app.register(effectiveDatingRoutes);
  await app.register(reconciliationRoutes);
  await app.register(migrationRoutes);
  await app.register(findingsRoutes);
  await app.register(rulesCompileRoutes);
  await app.register(findingsNarrateRoutes);

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
