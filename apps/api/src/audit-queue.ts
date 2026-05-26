/**
 * AuditQueue \u2014 the indirection between "user POSTed /audits/run" and "the
 * AuditEngine actually ran the work". Two implementations:
 *
 *   - InProcessAuditQueue: setImmediate dispatch. The default; suitable for
 *     single-node deployments and the test suite. Survives only as long as
 *     the process.
 *
 *   - PgBossAuditQueue: pg-boss backed; survives restarts and supports
 *     horizontal scale. Lazy-loaded so apps without pg-boss installed still
 *     build and run.
 *
 * The HTTP layer (POST /audits/run) calls AuditQueue.enqueue() and returns
 * 202 immediately. The worker side (registered during server bootstrap)
 * subscribes and calls runAuditJob.
 *
 * Concurrency note: a queue implementation may invoke onJob in parallel.
 * runAuditJob is already designed to be re-entrant per auditId (each run
 * gets its own AbortController in the inflight registry).
 */
import { runAuditJob, type AuditJobInput, type AuditRunnerLogger } from "./audit-runner.js";

export interface AuditQueue {
  /** Enqueue an audit job. Resolves once the job is durably persisted (Pg) */
  /** or scheduled (in-process). */
  enqueue(job: AuditJobInput): Promise<void>;
  /** Register the worker side. Implementations may start polling here. */
  startWorker(handler: (job: AuditJobInput) => Promise<void>): Promise<void>;
  /** Graceful shutdown \u2014 stops the worker and (for pg-boss) drains the pool. */
  shutdown(): Promise<void>;
}

/* ---------------- in-process queue (default) ---------------------- */

export interface InProcessAuditQueueOptions {
  logger: AuditRunnerLogger;
  /**
   * Max concurrent jobs executing at any moment. Defaults to 4. The queue
   * holds excess jobs in an internal buffer.
   */
  concurrency?: number;
}

export class InProcessAuditQueue implements AuditQueue {
  private readonly log: AuditRunnerLogger;
  private readonly concurrency: number;
  private inFlight = 0;
  private readonly buffer: AuditJobInput[] = [];
  private handler?: (job: AuditJobInput) => Promise<void>;
  private shuttingDown = false;
  private idleResolvers: Array<() => void> = [];

  constructor(opts: InProcessAuditQueueOptions) {
    this.log = opts.logger;
    this.concurrency = Math.max(1, opts.concurrency ?? 4);
  }

  async enqueue(job: AuditJobInput): Promise<void> {
    if (this.shuttingDown) {
      throw new Error("AuditQueue: enqueue after shutdown");
    }
    this.buffer.push(job);
    // Defer the dispatch to the next tick so callers can return 202 first.
    setImmediate(() => {
      this.pump();
    });
  }

  async startWorker(handler: (job: AuditJobInput) => Promise<void>): Promise<void> {
    this.handler = handler;
    // Drain any pre-enqueued jobs.
    setImmediate(() => this.pump());
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    // Wait for in-flight runs to settle, but don't wait for buffered jobs to
    // start \u2014 the caller is winding the process down.
    if (this.inFlight === 0) return;
    await new Promise<void>((resolve) => this.idleResolvers.push(resolve));
  }

  private pump(): void {
    if (!this.handler) return;
    while (
      !this.shuttingDown &&
      this.inFlight < this.concurrency &&
      this.buffer.length > 0
    ) {
      const job = this.buffer.shift();
      if (!job) break;
      this.inFlight++;
      const h = this.handler;
      Promise.resolve()
        .then(() => h(job))
        .catch((err) => {
          // runAuditJob is fire-and-forget by contract; if it ever rejects
          // we surface it on the logger so the queue itself doesn't crash.
          this.log.error("audit handler rejected", {
            auditId: job.auditId,
            err: (err as Error).message,
          });
        })
        .finally(() => {
          this.inFlight--;
          if (this.inFlight === 0 && this.idleResolvers.length > 0) {
            for (const r of this.idleResolvers) r();
            this.idleResolvers = [];
          }
          this.pump();
        });
    }
  }

  /** Test helper: drain the queue and wait for all in-flight to settle. */
  async _drain(): Promise<void> {
    if (this.inFlight === 0 && this.buffer.length === 0) return;
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (this.inFlight === 0 && this.buffer.length === 0) {
          resolve();
        } else {
          setImmediate(tick);
        }
      };
      tick();
    });
  }
}

/* ----------------- pg-boss queue (optional peer) ------------------ */

export interface PgBossAuditQueueOptions {
  connectionString: string;
  logger: AuditRunnerLogger;
  /** Queue name. Default: 'databridge.audits'. */
  name?: string;
}

interface PgBossLike {
  start(): Promise<void>;
  stop(opts?: { graceful?: boolean }): Promise<void>;
  send(name: string, data: unknown): Promise<string | null>;
  work(
    name: string,
    handler: (jobOrJobs: unknown) => Promise<void>,
  ): Promise<string>;
}

/**
 * pg-boss is loaded lazily so apps that don't need persistent queues don't
 * have to install it. Mirrors the pattern used by PgAuditStore for pg.
 */
export class PgBossAuditQueue implements AuditQueue {
  private readonly opts: PgBossAuditQueueOptions;
  private boss: PgBossLike | undefined;
  private readonly queueName: string;

  constructor(opts: PgBossAuditQueueOptions) {
    this.opts = opts;
    this.queueName = opts.name ?? "databridge.audits";
  }

  private async ensureBoss(): Promise<PgBossLike> {
    if (this.boss) return this.boss;
    let mod: { default?: new (cs: string) => PgBossLike };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mod = (await import("pg-boss" as any)) as typeof mod;
    } catch (err) {
      throw new Error(
        "apps/api: the optional peer 'pg-boss' is required for AUDIT_QUEUE=pgboss. " +
          "Install with: pnpm add pg-boss\n" +
          `Underlying error: ${(err as Error).message}`,
      );
    }
    const Ctor = mod.default;
    if (!Ctor) {
      throw new Error("apps/api: pg-boss module has no default export");
    }
    const boss = new Ctor(this.opts.connectionString);
    await boss.start();
    this.boss = boss;
    return boss;
  }

  async enqueue(job: AuditJobInput): Promise<void> {
    const boss = await this.ensureBoss();
    await boss.send(this.queueName, job);
  }

  async startWorker(handler: (job: AuditJobInput) => Promise<void>): Promise<void> {
    const boss = await this.ensureBoss();
    await boss.work(this.queueName, async (raw) => {
      // pg-boss v9+ may pass a single job or an array of jobs depending on
      // batchSize. We accept both shapes defensively.
      const jobs = Array.isArray(raw) ? raw : [raw];
      for (const j of jobs) {
        const payload = (j as { data?: unknown }).data ?? j;
        await handler(payload as AuditJobInput);
      }
    });
    this.opts.logger.info("pg-boss worker started", { queue: this.queueName });
  }

  async shutdown(): Promise<void> {
    const boss = this.boss;
    if (!boss) return;
    await boss.stop({ graceful: true });
    this.boss = undefined;
  }
}

/* ---------------------- factory ----------------------------------- */

export interface CreateAuditQueueOptions {
  logger: AuditRunnerLogger;
  /** Override AUDIT_QUEUE env. */
  mode?: "inprocess" | "pgboss";
  /** Override DATABASE_URL env (pg-boss only). */
  databaseUrl?: string;
}

/**
 * Resolve the queue impl by env:
 *   - AUDIT_QUEUE=pgboss + DATABASE_URL set \u2192 PgBossAuditQueue
 *   - otherwise \u2192 InProcessAuditQueue
 *
 * If pg-boss is requested but the import fails at worker start, callers
 * see the error on startWorker(); enqueue() then rejects and the route
 * surfaces 500 to the client \u2014 the operator's signal to install pg-boss
 * or unset AUDIT_QUEUE.
 */
export function createAuditQueue(opts: CreateAuditQueueOptions): AuditQueue {
  const mode = opts.mode ?? process.env["AUDIT_QUEUE"] ?? "inprocess";
  const databaseUrl = opts.databaseUrl ?? process.env["DATABASE_URL"];
  if (mode === "pgboss") {
    if (!databaseUrl) {
      opts.logger.warn(
        "AUDIT_QUEUE=pgboss requested but DATABASE_URL is unset; falling back to in-process queue",
      );
      return new InProcessAuditQueue({ logger: opts.logger });
    }
    return new PgBossAuditQueue({
      connectionString: databaseUrl,
      logger: opts.logger,
    });
  }
  return new InProcessAuditQueue({ logger: opts.logger });
}
