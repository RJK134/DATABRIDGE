/**
 * MemoryQueueAdapter — in-process QueueAdapter for unit tests and local dev.
 *
 * Not for production use. Does not persist across restarts, does not support
 * multiple workers across processes, and retry semantics are simplified.
 * Use PgBossQueueAdapter in production.
 */
import type {
  QueueAdapter,
  EnqueueOptions,
  WorkOptions,
  JobHandler,
  Job,
  JobStatus,
} from "./queue.js";

interface InternalJob {
  id: string;
  queue: string;
  data: object;
  status: JobStatus;
  retryCount: number;
  retryLimit: number;
  enqueuedAt: Date;
  startedOn?: Date;
  singletonKey?: string;
  delayUntil?: Date;
}

export class MemoryQueueAdapter implements QueueAdapter {
  private nextId = 1;
  private readonly jobs = new Map<string, InternalJob>();
  private readonly workers = new Map<string, JobHandler<object>>();
  private stopped = false;
  private pumpTimer: NodeJS.Timeout | undefined;

  async enqueue<T extends object>(queue: string, data: T, opts?: EnqueueOptions): Promise<string> {
    if (this.stopped) throw new Error("MemoryQueueAdapter: cannot enqueue after stop()");

    // Honor singletonKey: skip if an active/created job exists with the same key + queue.
    if (opts?.singletonKey) {
      for (const j of this.jobs.values()) {
        if (
          j.queue === queue &&
          j.singletonKey === opts.singletonKey &&
          (j.status === "created" || j.status === "active" || j.status === "retry")
        ) {
          return j.id;
        }
      }
    }

    const id = `mem-${this.nextId++}`;
    const job: InternalJob = {
      id,
      queue,
      data,
      status: "created",
      retryCount: 0,
      retryLimit: opts?.retryLimit ?? 0,
      enqueuedAt: new Date(),
    };
    if (opts?.singletonKey !== undefined) job.singletonKey = opts.singletonKey;
    if (opts?.delaySeconds !== undefined)
      job.delayUntil = new Date(Date.now() + opts.delaySeconds * 1000);
    this.jobs.set(id, job);
    this.schedulePump();
    return id;
  }

  async work<T extends object>(
    queue: string,
    handler: JobHandler<T>,
    _opts?: WorkOptions
  ): Promise<void> {
    this.workers.set(queue, handler as JobHandler<object>);
    this.schedulePump();
    return Promise.resolve();
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.status === "created" || job.status === "retry") {
      job.status = "cancelled";
    }
  }

  async getJob(jobId: string): Promise<JobStatus | null> {
    const job = this.jobs.get(jobId);
    return job ? job.status : null;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.pumpTimer !== undefined) {
      clearTimeout(this.pumpTimer);
      this.pumpTimer = undefined;
    }
    this.workers.clear();
  }

  /** Test helper: drain all eligible jobs synchronously. */
  async drain(): Promise<void> {
    await this.pump();
  }

  private schedulePump(): void {
    if (this.stopped || this.pumpTimer !== undefined) return;
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = undefined;
      void this.pump();
    }, 0);
  }

  private async pump(): Promise<void> {
    if (this.stopped) return;
    const now = Date.now();
    for (const job of this.jobs.values()) {
      if (job.status !== "created" && job.status !== "retry") continue;
      if (job.delayUntil && job.delayUntil.getTime() > now) continue;
      const handler = this.workers.get(job.queue);
      if (!handler) continue;

      job.status = "active";
      job.startedOn = new Date();
      const wrapper: Job<object> = {
        id: job.id,
        name: job.queue,
        data: job.data,
        retryCount: job.retryCount,
        startedOn: job.startedOn,
      };
      try {
        await handler(wrapper);
        job.status = "completed";
      } catch {
        if (job.retryCount < job.retryLimit) {
          job.retryCount += 1;
          job.status = "retry";
        } else {
          job.status = "failed";
        }
      }
    }
  }
}
