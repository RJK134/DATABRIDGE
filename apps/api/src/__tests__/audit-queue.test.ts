/**
 * Tests for the InProcessAuditQueue and createAuditQueue factory. Covers:
 *   - enqueue \u2192 worker handler invocation (single + multi)
 *   - concurrency cap is honoured
 *   - shutdown waits for in-flight to settle
 *   - factory picks InProcess by default, PgBoss when AUDIT_QUEUE=pgboss
 *     (without DATABASE_URL it falls back to InProcess with a warn)
 */
import { describe, it, expect } from "vitest";
import {
  InProcessAuditQueue,
  PgBossAuditQueue,
  createAuditQueue,
} from "../audit-queue.js";
import type { AuditJobInput, AuditRunnerLogger } from "../audit-runner.js";

const silentLogger: AuditRunnerLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

function job(id: string): AuditJobInput {
  return { auditId: id, tenantId: "t1", profileId: "sits" };
}

describe("InProcessAuditQueue", () => {
  it("invokes the worker handler once per enqueued job", async () => {
    const q = new InProcessAuditQueue({ logger: silentLogger });
    const seen: string[] = [];
    await q.startWorker(async (j) => {
      seen.push(j.auditId);
    });
    await q.enqueue(job("a"));
    await q.enqueue(job("b"));
    await q.enqueue(job("c"));
    await q._drain();
    expect(seen.sort()).toEqual(["a", "b", "c"]);
  });

  it("caps concurrent in-flight jobs to the configured limit", async () => {
    const q = new InProcessAuditQueue({ logger: silentLogger, concurrency: 2 });
    let active = 0;
    let peak = 0;
    await q.startWorker(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((r) => setTimeout(r, 20));
      active--;
    });
    for (let i = 0; i < 6; i++) await q.enqueue(job(`j${i}`));
    await q._drain();
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(0);
  });

  it("survives a handler that rejects (does not crash the queue)", async () => {
    const errors: unknown[] = [];
    const logger: AuditRunnerLogger = {
      ...silentLogger,
      error: (_msg, meta) => errors.push(meta),
    };
    const q = new InProcessAuditQueue({ logger });
    let calls = 0;
    await q.startWorker(async () => {
      calls++;
      if (calls === 1) throw new Error("boom");
    });
    await q.enqueue(job("a"));
    await q.enqueue(job("b"));
    await q._drain();
    expect(calls).toBe(2);
    expect(errors).toHaveLength(1);
  });

  it("rejects enqueue after shutdown", async () => {
    const q = new InProcessAuditQueue({ logger: silentLogger });
    await q.startWorker(async () => undefined);
    await q.shutdown();
    await expect(q.enqueue(job("x"))).rejects.toThrow(/after shutdown/);
  });

  it("shutdown waits for in-flight jobs to settle", async () => {
    const q = new InProcessAuditQueue({ logger: silentLogger, concurrency: 2 });
    let finished = 0;
    await q.startWorker(async () => {
      await new Promise<void>((r) => setTimeout(r, 30));
      finished++;
    });
    await q.enqueue(job("a"));
    await q.enqueue(job("b"));
    // Give the dispatch tick a moment to start the jobs before shutdown.
    await new Promise<void>((r) => setImmediate(r));
    await q.shutdown();
    expect(finished).toBe(2);
  });
});

describe("createAuditQueue factory", () => {
  it("returns InProcessAuditQueue by default", () => {
    const q = createAuditQueue({ logger: silentLogger });
    expect(q).toBeInstanceOf(InProcessAuditQueue);
  });

  it("returns InProcessAuditQueue when AUDIT_QUEUE=pgboss but DATABASE_URL is unset (falls back with warn)", () => {
    const warns: string[] = [];
    const logger: AuditRunnerLogger = {
      ...silentLogger,
      warn: (m) => warns.push(m),
    };
    const q = createAuditQueue({ logger, mode: "pgboss" });
    expect(q).toBeInstanceOf(InProcessAuditQueue);
    expect(warns.join(" ")).toMatch(/falling back/i);
  });

  it("returns PgBossAuditQueue when both AUDIT_QUEUE=pgboss and DATABASE_URL are set", () => {
    const q = createAuditQueue({
      logger: silentLogger,
      mode: "pgboss",
      databaseUrl: "postgres://nope:5432/x",
    });
    expect(q).toBeInstanceOf(PgBossAuditQueue);
  });
});
