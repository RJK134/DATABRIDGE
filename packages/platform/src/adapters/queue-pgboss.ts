/**
 * PgBossQueueAdapter — concrete QueueAdapter backed by pg-boss.
 *
 * pg-boss is a Postgres-only job queue (no Redis required), which fits the
 * single-datastore deployment story in DESIGN.md. The pg-boss library is
 * loaded lazily at start() time so the platform package can be imported in
 * environments that don't have Postgres or pg-boss installed (e.g. unit
 * tests that only exercise the QueueAdapter interface contract).
 *
 * Usage:
 *   const queue = new PgBossQueueAdapter({ connectionString: process.env.DATABASE_URL });
 *   await queue.start();
 *   const jobId = await queue.enqueue("audit.run", { engagementId: "..." });
 *   await queue.work("audit.run", async (job) => { ... });
 *   ...
 *   await queue.stop();
 *
 * Tests can use MemoryQueueAdapter (below) to verify queue-consuming code
 * without standing up Postgres.
 */
import type {
  QueueAdapter,
  EnqueueOptions,
  WorkOptions,
  JobHandler,
  Job,
  JobStatus,
} from "./queue.js";

// pg-boss types are deliberately structural to avoid a hard dep at import time.
// The library is loaded inside start() via dynamic import.
interface PgBossLike {
  start(): Promise<void>;
  stop(opts?: { graceful?: boolean; timeout?: number }): Promise<void>;
  send(name: string, data: object, options?: Record<string, unknown>): Promise<string | null>;
  work<T>(
    name: string,
    options: Record<string, unknown>,
    handler: (job: { id: string; name: string; data: T }) => Promise<void>
  ): Promise<string>;
  cancel(id: string): Promise<void>;
  getJobById(id: string): Promise<PgBossJob | null>;
}

interface PgBossJob {
  id: string;
  name: string;
  state: string;
  retrycount: number;
  startedon: Date | null;
  data: unknown;
}

interface PgBossModule {
  default: new (options: PgBossOptions) => PgBossLike;
}

export interface PgBossOptions {
  /** Postgres connection string (preferred). */
  connectionString?: string;
  /** Postgres host (if connectionString not provided). */
  host?: string;
  /** Postgres port. */
  port?: number;
  /** Postgres database. */
  database?: string;
  /** Postgres user. */
  user?: string;
  /** Postgres password. */
  password?: string;
  /** Schema (default: pgboss). */
  schema?: string;
  /** Application name shown in pg_stat_activity. */
  application_name?: string;
}

export class PgBossQueueAdapter implements QueueAdapter {
  private boss?: PgBossLike;
  private readonly options: PgBossOptions;
  private started = false;

  constructor(options: PgBossOptions) {
    if (!options.connectionString && !options.host) {
      throw new Error("PgBossQueueAdapter: must provide connectionString or host in options");
    }
    this.options = options;
  }

  /** Lazily load pg-boss and start the underlying boss instance. Idempotent. */
  async start(): Promise<void> {
    if (this.started) return;
    let mod: PgBossModule;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mod = (await import("pg-boss" as any)) as PgBossModule;
    } catch (err) {
      throw new Error(
        "PgBossQueueAdapter requires the 'pg-boss' package as a peer dependency. " +
          "Install with: pnpm add pg-boss\n" +
          `Underlying error: ${(err as Error).message}`
      );
    }
    const PgBoss = mod.default;
    this.boss = new PgBoss(this.options);
    await this.boss.start();
    this.started = true;
  }

  async enqueue<T extends object>(queue: string, data: T, opts?: EnqueueOptions): Promise<string> {
    await this.start();
    const bossOpts: Record<string, unknown> = {};
    if (opts?.delaySeconds !== undefined) bossOpts["startAfter"] = opts.delaySeconds;
    if (opts?.retryLimit !== undefined) bossOpts["retryLimit"] = opts.retryLimit;
    if (opts?.retryDelay !== undefined) bossOpts["retryDelay"] = opts.retryDelay;
    if (opts?.expireInSeconds !== undefined) bossOpts["expireInSeconds"] = opts.expireInSeconds;
    if (opts?.singletonKey !== undefined) bossOpts["singletonKey"] = opts.singletonKey;

    const id = await this.boss!.send(queue, data, bossOpts);
    if (!id) {
      throw new Error(
        `PgBossQueueAdapter.enqueue: pg-boss returned null id for queue '${queue}' (job may have been deduplicated by singletonKey)`
      );
    }
    return id;
  }

  async work<T extends object>(
    queue: string,
    handler: JobHandler<T>,
    opts?: WorkOptions
  ): Promise<void> {
    await this.start();
    const bossOpts: Record<string, unknown> = {};
    if (opts?.teamSize !== undefined) bossOpts["teamSize"] = opts.teamSize;
    if (opts?.teamConcurrency !== undefined) bossOpts["teamConcurrency"] = opts.teamConcurrency;
    if (opts?.batchSize !== undefined) bossOpts["batchSize"] = opts.batchSize;
    if (opts?.includeMetadata !== undefined) bossOpts["includeMetadata"] = opts.includeMetadata;

    await this.boss!.work<T>(queue, bossOpts, async (raw) => {
      const job: Job<T> = {
        id: raw.id,
        name: raw.name,
        data: raw.data,
        retryCount: 0, // pg-boss surfaces retrycount via includeMetadata; default 0
        startedOn: new Date(),
      };
      await handler(job);
    });
  }

  async cancel(jobId: string): Promise<void> {
    await this.start();
    await this.boss!.cancel(jobId);
  }

  async getJob(jobId: string): Promise<JobStatus | null> {
    await this.start();
    const job = await this.boss!.getJobById(jobId);
    if (!job) return null;
    return mapPgBossState(job.state);
  }

  async stop(): Promise<void> {
    if (!this.started || !this.boss) return;
    await this.boss.stop({ graceful: true, timeout: 30_000 });
    this.started = false;
  }
}

function mapPgBossState(state: string): JobStatus {
  switch (state) {
    case "created":
    case "retry":
    case "active":
    case "completed":
    case "expired":
    case "cancelled":
    case "failed":
      return state;
    default:
      // pg-boss has a couple of extra internal states; map unknowns to "created"
      return "created";
  }
}
