/**
 * Queue adapter tests.
 *
 * MemoryQueueAdapter is the primary unit under test; it exercises the same
 * QueueAdapter interface that PgBossQueueAdapter implements. PgBoss itself
 * is verified only by a smoke check (constructor argument validation) since
 * standing up Postgres in a unit test is out of scope.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryQueueAdapter } from "../adapters/queue-memory.js";
import { PgBossQueueAdapter } from "../adapters/queue-pgboss.js";
import type { Job } from "../adapters/queue.js";

describe("MemoryQueueAdapter", () => {
  let queue: MemoryQueueAdapter;

  beforeEach(() => {
    queue = new MemoryQueueAdapter();
  });

  afterEach(async () => {
    await queue.stop();
  });

  it("enqueues a job and returns an id", async () => {
    const id = await queue.enqueue("audit.run", { engagementId: "ENG-1" });
    expect(id).toMatch(/^mem-/);
    const status = await queue.getJob(id);
    expect(status).toBe("created");
  });

  it("runs a worker and completes the job", async () => {
    const seen: Array<Job<{ engagementId: string }>> = [];
    await queue.work<{ engagementId: string }>("audit.run", async (job) => {
      seen.push(job);
    });
    const id = await queue.enqueue("audit.run", { engagementId: "ENG-1" });
    await queue.drain();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.data.engagementId).toBe("ENG-1");
    expect(await queue.getJob(id)).toBe("completed");
  });

  it("retries on handler failure up to retryLimit then marks failed", async () => {
    let attempts = 0;
    await queue.work("flaky", async () => {
      attempts++;
      throw new Error("boom");
    });
    const id = await queue.enqueue("flaky", { x: 1 }, { retryLimit: 2 });
    // run pump until terminal state
    for (let i = 0; i < 5; i++) await queue.drain();
    expect(attempts).toBe(3); // 1 initial + 2 retries
    expect(await queue.getJob(id)).toBe("failed");
  });

  it("cancels a created job", async () => {
    const id = await queue.enqueue("never.runs", { x: 1 });
    await queue.cancel(id);
    expect(await queue.getJob(id)).toBe("cancelled");
  });

  it("deduplicates by singletonKey while a job is pending", async () => {
    const a = await queue.enqueue("once", { x: 1 }, { singletonKey: "k1" });
    const b = await queue.enqueue("once", { x: 2 }, { singletonKey: "k1" });
    expect(a).toBe(b);
  });

  it("returns null for unknown job id", async () => {
    expect(await queue.getJob("does-not-exist")).toBeNull();
  });
});

describe("PgBossQueueAdapter", () => {
  it("rejects construction with no connectionString or host", () => {
    expect(() => new PgBossQueueAdapter({})).toThrow(/must provide connectionString or host/);
  });

  it("accepts construction with connectionString", () => {
    expect(
      () =>
        new PgBossQueueAdapter({
          connectionString: "postgres://user:pass@localhost:5432/db",
        })
    ).not.toThrow();
  });

  it("accepts construction with host", () => {
    expect(
      () =>
        new PgBossQueueAdapter({
          host: "localhost",
          database: "db",
          user: "u",
          password: "p",
        })
    ).not.toThrow();
  });

  it("start() surfaces a clear error if pg-boss is not installed", async () => {
    const adapter = new PgBossQueueAdapter({
      connectionString: "postgres://localhost/x",
    });
    await expect(adapter.start()).rejects.toThrow(/pg-boss/);
  });
});
