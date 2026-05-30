/**
 * AuditReport store — shared shape used by both in-memory and persistent
 * implementations.
 *
 * Phase E1 shipped an in-memory store as the bootstrap implementation.
 * Phase E4 introduces a Postgres-backed store (see pg-audit-store.ts) that
 * implements the same interface. The route layer talks to AuditStoreLike;
 * the bootstrap chooses which implementation to wire based on DATABASE_URL.
 *
 * Test boundary: tests can call setAuditStore() to inject a fresh in-memory
 * store between cases without touching module-level state.
 */

import type { AuditReport } from "@databridge/rule-core";

export type AuditStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface AuditRecord {
  auditId: string;
  tenantId: string;
  profileId: string;
  status: AuditStatus;
  createdAt: string;
  updatedAt: string;
  /** Present only when status === "succeeded". */
  report?: AuditReport;
  /** Present only when status === "failed". */
  error?: string;
}

/**
 * Backing store contract. All methods are async so a Postgres implementation
 * can satisfy it; in-memory implementations resolve synchronously.
 */
export interface AuditStoreLike {
  create(record: Omit<AuditRecord, "createdAt" | "updatedAt">): Promise<AuditRecord>;
  update(
    auditId: string,
    patch: Partial<Omit<AuditRecord, "auditId" | "createdAt">>
  ): Promise<AuditRecord | undefined>;
  get(auditId: string): Promise<AuditRecord | undefined>;
  list(filter?: { tenantId?: string }): Promise<AuditRecord[]>;
  clear(): Promise<void>;
}

/* ----------------------------- in-memory --------------------------------- */

export class InMemoryAuditStore implements AuditStoreLike {
  private readonly byId = new Map<string, AuditRecord>();

  async create(record: Omit<AuditRecord, "createdAt" | "updatedAt">): Promise<AuditRecord> {
    const now = new Date().toISOString();
    const full: AuditRecord = { ...record, createdAt: now, updatedAt: now };
    this.byId.set(full.auditId, full);
    return full;
  }

  async update(
    auditId: string,
    patch: Partial<Omit<AuditRecord, "auditId" | "createdAt">>
  ): Promise<AuditRecord | undefined> {
    const existing = this.byId.get(auditId);
    if (!existing) return undefined;
    const updated: AuditRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.byId.set(auditId, updated);
    return updated;
  }

  async get(auditId: string): Promise<AuditRecord | undefined> {
    return this.byId.get(auditId);
  }

  async list(filter?: { tenantId?: string }): Promise<AuditRecord[]> {
    const all = Array.from(this.byId.values());
    const filtered = filter?.tenantId ? all.filter((r) => r.tenantId === filter.tenantId) : all;
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async clear(): Promise<void> {
    this.byId.clear();
  }
}

/**
 * Back-compat alias — earlier code imported the concrete class as
 * `AuditStore`. Keep the alias so external code that depended on the
 * Phase-E1 shape still compiles.
 */
export const AuditStore = InMemoryAuditStore;
export type AuditStore = InMemoryAuditStore;

/* ----------------------------- module singleton -------------------------- */

let _store: AuditStoreLike = new InMemoryAuditStore();

/** Currently active store. Routes import this. */
export const auditStore: AuditStoreLike = new Proxy({} as AuditStoreLike, {
  get(_t, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_store as any)[prop];
  },
});

/**
 * Replace the active store. Called once at bootstrap (createAuditStore
 * picks Pg vs in-memory based on DATABASE_URL) and again from tests to
 * reset between cases.
 */
export function setAuditStore(store: AuditStoreLike): void {
  _store = store;
}

/** Read-only handle for tests that want to inspect the active store. */
export function getActiveAuditStore(): AuditStoreLike {
  return _store;
}
