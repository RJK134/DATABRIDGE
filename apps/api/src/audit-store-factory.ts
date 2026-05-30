/**
 * Pick the right AuditStore implementation for the current environment.
 *
 *   - DATABASE_URL set  → PgAuditStore (lazy-loads `pg`, ensures schema)
 *   - DATABASE_URL unset → InMemoryAuditStore (Phase E1 default)
 *
 * Tests get the in-memory implementation by virtue of not setting
 * DATABASE_URL; the apps/api server.ts wires the result into the
 * module-level singleton via setAuditStore().
 */

import type { Logger } from "pino";
import { InMemoryAuditStore, type AuditStoreLike } from "./audit-store.js";
import { PgAuditStore } from "./pg-audit-store.js";

export interface CreateAuditStoreOptions {
  /** Override the URL pulled from process.env. */
  databaseUrl?: string;
  /** Logger for one-shot info() about which implementation was chosen. */
  logger?: Pick<Logger, "info" | "warn"> | { info: (o: object) => void };
}

export async function createAuditStore(
  opts: CreateAuditStoreOptions = {}
): Promise<AuditStoreLike> {
  const url = opts.databaseUrl ?? process.env["DATABASE_URL"];
  if (!url) {
    opts.logger?.info?.({
      msg: "AuditStore: DATABASE_URL not set, using in-memory store",
    });
    return new InMemoryAuditStore();
  }
  const store = new PgAuditStore({ connectionString: url });
  try {
    await store.ensureSchema();
    opts.logger?.info?.({
      msg: "AuditStore: PgAuditStore initialised",
    });
    return store;
  } catch (err) {
    // pg not installed, or DDL failed — fall back to in-memory so the API
    // still boots. Surface the warning so operators notice.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (opts.logger as any)?.warn?.({
      msg: "AuditStore: Pg init failed, falling back to in-memory",
      err: (err as Error).message,
    });
    return new InMemoryAuditStore();
  }
}
