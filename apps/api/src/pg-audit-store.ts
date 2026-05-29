/**
 * PgAuditStore — Postgres-backed implementation of AuditStoreLike.
 *
 * pg is an OPTIONAL peer (declared at the workspace root and lazy-loaded
 * here). When DATABASE_URL is unset, the bootstrap picks the in-memory
 * store instead — see audit-store-factory.ts.
 *
 * Schema: audits table with audit_id PK and a single JSONB column for the
 * report payload. We do not split findings into a separate table yet —
 * the report is read whole. If/when ad-hoc finding queries become useful,
 * a flattened audit_findings view can be layered on top without changing
 * this surface.
 *
 * Migrations live in apps/api/migrations/001_audit_store.sql and are run
 * out-of-band (e.g. by Flyway/sqitch or an explicit npm script). The
 * store offers an ensureSchema() helper that runs the same DDL idempotently
 * for local-dev and tests so a fresh database works without manual setup.
 */

import type { AuditReport } from "@databridge/rule-core";
import type { AuditRecord, AuditStoreLike, AuditStatus } from "./audit-store.js";

/* ------------------------------ pg surface -------------------------------- */

/** Minimal structural subset of pg's Pool/Client we depend on. */
export interface PgPoolLike {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
  end?(): Promise<void>;
}

export interface PgPoolCtor {
  new (config: Record<string, unknown>): PgPoolLike;
}

interface PgModuleLike {
  Pool?: PgPoolCtor;
  default?: { Pool?: PgPoolCtor };
}

async function loadPgPool(): Promise<PgPoolCtor> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import("pg" as any)) as PgModuleLike;
    const Pool = mod.Pool ?? mod.default?.Pool;
    if (!Pool) throw new Error("pg module did not export Pool");
    return Pool;
  } catch (err) {
    throw new Error(
      "@databridge/api: optional peer 'pg' is not installed. " +
        "Install it in apps/api or unset DATABASE_URL to fall back to the in-memory store.\n" +
        `Underlying error: ${(err as Error).message}`
    );
  }
}

/* --------------------------------- schema --------------------------------- */

/**
 * Same SQL as migrations/001_audit_store.sql. Kept inline so a fresh
 * database can be initialised without depending on the migration runner.
 */
export const AUDIT_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS audits (
  audit_id     TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  profile_id   TEXT NOT NULL,
  status       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  report       JSONB,
  error        TEXT
);
CREATE INDEX IF NOT EXISTS audits_tenant_created_idx
  ON audits (tenant_id, created_at DESC);
`;

/* ------------------------------ implementation ---------------------------- */

export interface PgAuditStoreOptions {
  /** Pre-built pool (e.g. injected by tests). If absent, we'll build one. */
  pool?: PgPoolLike;
  /** Connection string used when pool is not provided. */
  connectionString?: string;
  /** Skip ensureSchema on construct. Default false. */
  skipSchema?: boolean;
}

export class PgAuditStore implements AuditStoreLike {
  private pool: PgPoolLike | undefined;
  private readonly opts: PgAuditStoreOptions;
  private schemaEnsured = false;

  constructor(opts: PgAuditStoreOptions = {}) {
    this.opts = opts;
    if (opts.pool) this.pool = opts.pool;
  }

  /** Lazy-init the pool on first query. */
  private async getPool(): Promise<PgPoolLike> {
    if (this.pool) return this.pool;
    const Pool = await loadPgPool();
    this.pool = new Pool({
      connectionString: this.opts.connectionString ?? process.env["DATABASE_URL"],
    });
    return this.pool;
  }

  async ensureSchema(): Promise<void> {
    if (this.schemaEnsured) return;
    if (this.opts.skipSchema) {
      this.schemaEnsured = true;
      return;
    }
    const pool = await this.getPool();
    await pool.query(AUDIT_TABLE_DDL);
    this.schemaEnsured = true;
  }

  async create(record: Omit<AuditRecord, "createdAt" | "updatedAt">): Promise<AuditRecord> {
    await this.ensureSchema();
    const pool = await this.getPool();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO audits
         (audit_id, tenant_id, profile_id, status, created_at, updated_at, report, error)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`,
      [
        record.auditId,
        record.tenantId,
        record.profileId,
        record.status,
        now,
        record.report ? JSON.stringify(record.report) : null,
        record.error ?? null,
      ]
    );
    return {
      ...record,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(
    auditId: string,
    patch: Partial<Omit<AuditRecord, "auditId" | "createdAt">>
  ): Promise<AuditRecord | undefined> {
    await this.ensureSchema();
    const pool = await this.getPool();
    const now = new Date().toISOString();
    // Build SET clause dynamically. Keep names whitelisted for safety.
    const sets: string[] = ["updated_at = $1"];
    const params: unknown[] = [now];
    if (patch.tenantId !== undefined) {
      params.push(patch.tenantId);
      sets.push(`tenant_id = $${params.length}`);
    }
    if (patch.profileId !== undefined) {
      params.push(patch.profileId);
      sets.push(`profile_id = $${params.length}`);
    }
    if (patch.status !== undefined) {
      params.push(patch.status);
      sets.push(`status = $${params.length}`);
    }
    if (patch.report !== undefined) {
      params.push(JSON.stringify(patch.report));
      sets.push(`report = $${params.length}`);
    }
    if (patch.error !== undefined) {
      params.push(patch.error);
      sets.push(`error = $${params.length}`);
    }
    params.push(auditId);
    const sql = `UPDATE audits SET ${sets.join(", ")} WHERE audit_id = $${params.length}`;
    const result = await pool.query(sql, params);
    if ((result.rowCount ?? 0) === 0) return undefined;
    return this.get(auditId);
  }

  async get(auditId: string): Promise<AuditRecord | undefined> {
    await this.ensureSchema();
    const pool = await this.getPool();
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT audit_id, tenant_id, profile_id, status, created_at, updated_at, report, error
       FROM audits WHERE audit_id = $1`,
      [auditId]
    );
    const row = rows[0];
    if (!row) return undefined;
    return rowToRecord(row);
  }

  async list(filter?: { tenantId?: string }): Promise<AuditRecord[]> {
    await this.ensureSchema();
    const pool = await this.getPool();
    const params: unknown[] = [];
    let where = "";
    if (filter?.tenantId) {
      params.push(filter.tenantId);
      where = `WHERE tenant_id = $1`;
    }
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT audit_id, tenant_id, profile_id, status, created_at, updated_at, report, error
       FROM audits ${where}
       ORDER BY created_at DESC`,
      params
    );
    return rows.map(rowToRecord);
  }

  async clear(): Promise<void> {
    await this.ensureSchema();
    const pool = await this.getPool();
    await pool.query(`TRUNCATE TABLE audits`);
  }

  /** Close the underlying pool. Useful for tests. */
  async close(): Promise<void> {
    if (this.pool?.end) await this.pool.end();
  }
}

/* ------------------------------- helpers ---------------------------------- */

function rowToRecord(row: Record<string, unknown>): AuditRecord {
  const createdAt = toIso(row["created_at"]);
  const updatedAt = toIso(row["updated_at"]);
  const report = row["report"];
  const errorVal = row["error"];

  const record: AuditRecord = {
    auditId: String(row["audit_id"]),
    tenantId: String(row["tenant_id"]),
    profileId: String(row["profile_id"]),
    status: String(row["status"]) as AuditStatus,
    createdAt,
    updatedAt,
    ...(report !== null && report !== undefined ? { report: parseReport(report) } : {}),
    ...(errorVal !== null && errorVal !== undefined ? { error: String(errorVal) } : {}),
  };
  return record;
}

function parseReport(v: unknown): AuditReport {
  if (typeof v === "string") return JSON.parse(v) as AuditReport;
  return v as AuditReport;
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return new Date().toISOString();
}
