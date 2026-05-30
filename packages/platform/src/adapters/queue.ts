/**
 * QueueAdapter — pluggable job queue
 * Default implementation: pg-boss (Postgres-backed, no Redis required)
 * Alternative: BullMQ (Redis)
 */
export interface QueueAdapter {
  /** Enqueue a job. Returns the job ID. */
  enqueue<T extends object>(queue: string, data: T, opts?: EnqueueOptions): Promise<string>;

  /** Register a worker for a queue. */
  work<T extends object>(queue: string, handler: JobHandler<T>, opts?: WorkOptions): Promise<void>;

  /** Cancel a pending job by ID. */
  cancel(jobId: string): Promise<void>;

  /** Get job status. */
  getJob(jobId: string): Promise<JobStatus | null>;

  /** Graceful shutdown. */
  stop(): Promise<void>;
}

export interface EnqueueOptions {
  /** Delay in seconds before the job becomes available */
  delaySeconds?: number;
  /** Max retry attempts */
  retryLimit?: number;
  /** Retry delay in seconds */
  retryDelay?: number;
  /** Job expiry in seconds */
  expireInSeconds?: number;
  /** Deduplicate by key within a window */
  singletonKey?: string;
}

export interface WorkOptions {
  teamSize?: number;
  teamConcurrency?: number;
  batchSize?: number;
  includeMetadata?: boolean;
}

export type JobHandler<T> = (job: Job<T>) => Promise<void>;

export interface Job<T> {
  id: string;
  name: string;
  data: T;
  retryCount: number;
  startedOn: Date;
}

export type JobStatus =
  | "created"
  | "retry"
  | "active"
  | "completed"
  | "expired"
  | "cancelled"
  | "failed";
