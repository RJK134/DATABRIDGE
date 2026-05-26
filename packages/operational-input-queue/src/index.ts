/**
 * Phase J6 — operational-input queue.
 *
 * An in-memory queue for fields that the source system cannot supply
 * (e.g. `scj_hiqp`, classification gaps when policy is
 * `queue-for-registry`). Migrations enqueue work items; Registry staff
 * consume them and supply values; the runner re-applies them before
 * the next commit cycle.
 *
 * The queue is intentionally trivial — production deployments swap it
 * for a database-backed implementation by satisfying the same shape.
 */

export type QueueItemStatus = "open" | "resolved" | "skipped";

export interface QueueItem {
  /** Server-generated id. */
  id: string;
  /** Logical entity the missing field belongs to. */
  entity: string;
  /** Source row identity for traceability. */
  sourceId?: string;
  /** Field that needs filling. */
  field: string;
  /** Free-form explanation of why the row is here. */
  reason: string;
  /** Optional context payload (the row as-projected). */
  context?: Record<string, unknown>;
  /** Current status. */
  status: QueueItemStatus;
  /** Provided value once resolved. */
  value?: string | number | boolean | null;
  /** Free-form resolver note. */
  resolvedBy?: string;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueArgs {
  entity: string;
  field: string;
  reason: string;
  sourceId?: string;
  context?: Record<string, unknown>;
}

export interface ResolveArgs {
  id: string;
  value: string | number | boolean | null;
  resolvedBy: string;
}

export interface SkipArgs {
  id: string;
  resolvedBy: string;
  note?: string;
}

export class OperationalInputQueue {
  private nextSeq = 1;
  private readonly items = new Map<string, QueueItem>();
  private readonly clock: () => string;

  constructor(clock?: () => string) {
    this.clock = clock ?? (() => new Date().toISOString());
  }

  enqueue(args: EnqueueArgs): QueueItem {
    const id = `oiq-${this.nextSeq++}`;
    const now = this.clock();
    const item: QueueItem = {
      id,
      entity: args.entity,
      field: args.field,
      reason: args.reason,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    if (args.sourceId !== undefined) item.sourceId = args.sourceId;
    if (args.context !== undefined) item.context = args.context;
    this.items.set(id, item);
    return item;
  }

  resolve(args: ResolveArgs): QueueItem {
    const item = this.items.get(args.id);
    if (!item) throw new Error(`operational-input-queue: no such item ${args.id}`);
    if (item.status !== "open") {
      throw new Error(`operational-input-queue: ${args.id} is ${item.status}, not open`);
    }
    item.value = args.value;
    item.resolvedBy = args.resolvedBy;
    item.status = "resolved";
    item.updatedAt = this.clock();
    return item;
  }

  skip(args: SkipArgs): QueueItem {
    const item = this.items.get(args.id);
    if (!item) throw new Error(`operational-input-queue: no such item ${args.id}`);
    if (item.status !== "open") {
      throw new Error(`operational-input-queue: ${args.id} is ${item.status}, not open`);
    }
    item.status = "skipped";
    item.resolvedBy = args.resolvedBy;
    if (args.note !== undefined) {
      item.reason = `${item.reason} (skipped: ${args.note})`;
    }
    item.updatedAt = this.clock();
    return item;
  }

  get(id: string): QueueItem | undefined {
    return this.items.get(id);
  }

  list(filter?: { status?: QueueItemStatus; entity?: string }): QueueItem[] {
    return Array.from(this.items.values()).filter((it) => {
      if (filter?.status && it.status !== filter.status) return false;
      if (filter?.entity && it.entity !== filter.entity) return false;
      return true;
    });
  }

  /**
   * Snapshot the entire queue as a JSON-serialisable array — used for
   * export to disk / API responses.
   */
  toJSON(): QueueItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Restore from a previous snapshot. Replaces the in-memory state.
   */
  loadSnapshot(items: readonly QueueItem[]): void {
    this.items.clear();
    let maxSeq = 0;
    for (const it of items) {
      this.items.set(it.id, { ...it });
      const match = /^oiq-(\d+)$/.exec(it.id);
      if (match) {
        const n = parseInt(match[1]!, 10);
        if (n > maxSeq) maxSeq = n;
      }
    }
    this.nextSeq = maxSeq + 1;
  }

  /** Compact stats useful for dashboards. */
  stats(): { open: number; resolved: number; skipped: number; total: number } {
    let open = 0;
    let resolved = 0;
    let skipped = 0;
    for (const it of this.items.values()) {
      if (it.status === "open") open++;
      else if (it.status === "resolved") resolved++;
      else skipped++;
    }
    return { open, resolved, skipped, total: this.items.size };
  }
}
