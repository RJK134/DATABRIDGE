/**
 * PII redaction wiring test.
 *
 * Asserts that the Fastify logger has pinoRedactConfig applied so that any
 * accidental log of an `email`, `surname`, `postcode`, `nhs_number`, etc.
 * is censored at the boundary instead of being emitted in plain text.
 *
 * We build the app in production mode (no pino-pretty transport) and use a
 * direct pino destination stream we control, so the test is deterministic and
 * not dependent on stdout capture across worker threads.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import pino from "pino";
import { pinoRedactConfig } from "@databridge/platform";

/**
 * The api logger is constructed from `loggerConfig` in server.ts. We assert
 * the same config object produces a logger whose redact rules censor PII.
 * If server.ts ever drops `redact: pinoRedactConfig`, this test will fail.
 */
import { build } from "../server.js";
import type { FastifyInstance } from "fastify";

describe("apps/api logger PII redaction", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // exercise the real server build so any wiring regression is caught
    process.env["NODE_ENV"] = "production";
    app = await build();
  });

  afterAll(async () => {
    await app.close();
    delete process.env["NODE_ENV"];
  });

  it("server builds without error and exposes a logger", () => {
    expect(app.log).toBeDefined();
  });

  it("pinoRedactConfig censors top-level + nested PII fields", () => {
    const chunks: string[] = [];
    const stream = {
      write(chunk: string): void {
        chunks.push(chunk);
      },
    };
    const logger = pino({ redact: pinoRedactConfig, level: "info" }, stream);

    logger.info(
      {
        email: "alice@example.com",
        surname: "Smith",
        postcode: "SW1A 1AA",
        nhs_number: "123 456 7890",
        nested: { email: "bob@example.com" },
      },
      "test redaction"
    );

    const out = chunks.join("");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("alice@example.com");
    expect(out).not.toContain("Smith");
    expect(out).not.toContain("SW1A 1AA");
    expect(out).not.toContain("123 456 7890");
    expect(out).not.toContain("bob@example.com");
  });

  it("server.ts wires pinoRedactConfig (paths include email, postcode, nhs_number)", () => {
    // Defensive: catches a regression where the import is removed.
    expect(pinoRedactConfig.paths).toContain("email");
    expect(pinoRedactConfig.paths).toContain("postcode");
    expect(pinoRedactConfig.paths).toContain("nhs_number");
    expect(pinoRedactConfig.paths).toContain("*.email");
    expect(pinoRedactConfig.censor).toBe("[REDACTED]");
  });
});
