/**
 * Postgres-backed {@link LearningStore}.
 *
 * The default in-memory store (and the filesystem JSON variant) work
 * great for single-engineer workstations. Multi-tenant deployments —
 * Azure App Service, Kubernetes, anything where the suggester runs in
 * more than one process or pod — need a shared backend with proper
 * concurrent-write semantics.
 *
 * Storage shape:
 *
 *   CREATE TABLE IF NOT EXISTS databridge_learning (
 *     system            TEXT NOT NULL,
 *     source_column     TEXT NOT NULL,
 *     canonical         TEXT NOT NULL,
 *     entity            TEXT NOT NULL,
 *     accept_count      INTEGER NOT NULL DEFAULT 1,
 *     last_accepted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     PRIMARY KEY (system, source_column, canonical)
 *   );
 *
 * The triple `(system, source_column, canonical)` is the natural key —
 * the same source column can map to multiple canonical fields with
 * independent accept counts (e.g. `stu_id` → `Person.studentId` or
 * `Application.studentId`).
 *
 * Concurrency: `record()` uses `INSERT … ON CONFLICT … DO UPDATE` so
 * concurrent writers from different pods converge on the canonical
 * count without locking. Reads are at READ COMMITTED so a lookup mid-
 * write returns either the old or the new value, never a torn row.
 *
 * pg is loaded lazily — same pattern as `@databridge/rule-core`
 * `PgSqlExecutor`. Consumers install `pg` themselves; this package
 * stays installable without libpq.
 */
import type { LearnedMapping, LearningStore, RecordCorrectionInput } from "./learning.js";
import type { CrosswalkSystem } from "./types.js";

/* ----------------------------- pg surface ---------------------------------- */

/**
 * Minimal pg surface we depend on. Mirrors the shape used by
 * `@databridge/rule-core/sql-executor-pg.ts` so callers can pass an
 * already-constructed pool from elsewhere in the platform.
 */
export interface PgClientLike {
  connect(): Promise<void>;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
  end(): Promise<void>;
}

export interface PgClientCtor {
  new (config: Record<string, unknown>): PgClientLike;
}

interface PgModuleLike {
  Client: PgClientCtor;
  default?: { Client: PgClientCtor };
}

async function loadPg(): Promise<{ Client: PgClientCtor }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import("pg" as any)) as PgModuleLike;
    const Client = mod.Client ?? mod.default?.Client;
    if (!Client) throw new Error("pg module did not export Client");
    return { Client };
  } catch (err) {
    throw new Error(
      "@databridge/schema-mapper: the optional peer 'pg' is not installed. " +
        "Install it in the consuming app with: pnpm add pg @types/pg\n" +
        `Underlying error: ${(err as Error).message}`,
    );
  }
}

/* --------------------------- public configuration -------------------------- */

export interface PostgresLearningStoreOptions {
  /** Connection string (preferred). */
  connectionString?: string;

  /** Or a full pg.ClientConfig object. */
  clientConfig?: Record<string, unknown>;

  /**
   * Injectable Client factory — tests substitute a fake pg.Client here.
   * If unset, the real `pg` module is lazy-loaded.
   */
  clientFactory?: (
    config: Record<string, unknown>,
  ) => PgClientLike | Promise<PgClientLike>;

  /**
   * Table name. Defaults to `databridge_learning`. Schema-qualify if you
   * need a non-public schema, e.g. `audit.databridge_learning`.
   */
  tableName?: string;

  /**
   * If true (default), `ensureSchema()` is invoked the first time the
   * store is used. Set false in environments where DDL is run via
   * migrations and the runtime role lacks CREATE.
   */
  autoMigrate?: boolean;
}

/* --------------------------- DDL + SQL templates --------------------------- */

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`PostgresLearningStore: refusing unsafe identifier '${name}'`);
  }
  return `"${name}"`;
}

/** Resolve "schema.table" → quoted qualified name. */
function qualifyTable(raw: string): { qualified: string; schema?: string; table: string } {
  const parts = raw.split(".");
  if (parts.length === 1) {
    return { qualified: quoteIdent(parts[0]!), table: parts[0]! };
  }
  if (parts.length === 2) {
    return {
      qualified: `${quoteIdent(parts[0]!)}.${quoteIdent(parts[1]!)}`,
      schema: parts[0]!,
      table: parts[1]!,
    };
  }
  throw new Error(`PostgresLearningStore: invalid tableName '${raw}'`);
}

/* ----------------------------- implementation ------------------------------ */

/**
 * Concrete `LearningStore` backed by a Postgres table.
 *
 * Every method opens a fresh client, runs its query, and closes — same
 * tradeoff as `PgSqlExecutor`. If you need pooling, wrap with a pool
 * adapter via {@link PostgresLearningStoreOptions.clientFactory}.
 *
 * The store implements the synchronous {@link LearningStore} contract,
 * but every method is internally async — synchronous callers must `await`.
 * (The interface declares synchronous returns; this implementation
 * intentionally widens them to `Promise<…>` for the I/O-bound paths.
 * See {@link AsyncLearningStore}.)
 */
export interface AsyncLearningStore {
  lookup(
    system: CrosswalkSystem,
    sourceColumn: string,
  ): Promise<LearnedMapping | undefined>;
  record(input: RecordCorrectionInput): Promise<LearnedMapping>;
  dumpAll(): Promise<readonly LearnedMapping[]>;
  loadAll(entries: readonly LearnedMapping[]): Promise<void>;
  size(): Promise<number>;
  clear(): Promise<void>;
  ensureSchema(): Promise<void>;
}

export class PostgresLearningStore implements AsyncLearningStore {
  private readonly tableQualified: string;
  private readonly tableRaw: string;
  private readonly autoMigrate: boolean;
  private migrated = false;

  constructor(private readonly opts: PostgresLearningStoreOptions) {
    const t = qualifyTable(opts.tableName ?? "databridge_learning");
    this.tableQualified = t.qualified;
    this.tableRaw = opts.tableName ?? "databridge_learning";
    this.autoMigrate = opts.autoMigrate ?? true;
  }

  /** Resolved fully-qualified table name (quoted). Exposed for diagnostics. */
  getTableName(): string {
    return this.tableRaw;
  }

  /**
   * Create the table + indexes if they don't already exist. Idempotent.
   * Callers can disable the implicit call from each method by setting
   * `autoMigrate: false` and invoking this once at boot.
   */
  async ensureSchema(): Promise<void> {
    if (this.migrated) return;
    const ddl = `
      CREATE TABLE IF NOT EXISTS ${this.tableQualified} (
        system            TEXT        NOT NULL,
        source_column     TEXT        NOT NULL,
        canonical         TEXT        NOT NULL,
        entity            TEXT        NOT NULL,
        accept_count      INTEGER     NOT NULL DEFAULT 1,
        last_accepted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (system, source_column, canonical)
      );
      CREATE INDEX IF NOT EXISTS ${quoteIdent(this.idxNameFor("lookup"))}
        ON ${this.tableQualified} (system, source_column);
    `;
    await this.withClient(async (client) => {
      // pg lets us send multiple statements in one query; harmless to
      // run repeatedly.
      await client.query(ddl);
    });
    this.migrated = true;
  }

  async lookup(
    system: CrosswalkSystem,
    sourceColumn: string,
  ): Promise<LearnedMapping | undefined> {
    await this.maybeMigrate();
    // Best = max accept_count, ties broken by most recent last_accepted_at.
    // Match key uses the normalised column (trim + lowercase) so callers
    // don't have to.
    const sql = `
      SELECT system, source_column, canonical, entity, accept_count, last_accepted_at
        FROM ${this.tableQualified}
       WHERE system = $1
         AND lower(btrim(source_column)) = lower(btrim($2))
       ORDER BY accept_count DESC, last_accepted_at DESC
       LIMIT 1
    `;
    return this.withClient(async (client) => {
      const res = await client.query<PgRow>(sql, [system, sourceColumn]);
      const row = res.rows[0];
      return row ? rowToMapping(row) : undefined;
    });
  }

  async record(input: RecordCorrectionInput): Promise<LearnedMapping> {
    await this.maybeMigrate();
    const at = (input.at ?? new Date()).toISOString();
    const sql = `
      INSERT INTO ${this.tableQualified}
        (system, source_column, canonical, entity, accept_count, last_accepted_at)
      VALUES ($1, $2, $3, $4, 1, $5)
      ON CONFLICT (system, source_column, canonical) DO UPDATE
        SET accept_count     = ${this.tableQualified}.accept_count + 1,
            last_accepted_at = EXCLUDED.last_accepted_at,
            entity           = EXCLUDED.entity
      RETURNING system, source_column, canonical, entity, accept_count, last_accepted_at
    `;
    return this.withClient(async (client) => {
      const res = await client.query<PgRow>(sql, [
        input.system,
        input.sourceColumn,
        input.canonical,
        input.entity,
        at,
      ]);
      if (!res.rows[0]) {
        throw new Error("PostgresLearningStore: record() returned no row");
      }
      return rowToMapping(res.rows[0]);
    });
  }

  async dumpAll(): Promise<readonly LearnedMapping[]> {
    await this.maybeMigrate();
    const sql = `
      SELECT system, source_column, canonical, entity, accept_count, last_accepted_at
        FROM ${this.tableQualified}
       ORDER BY system, source_column, canonical
    `;
    return this.withClient(async (client) => {
      const res = await client.query<PgRow>(sql);
      return res.rows.map(rowToMapping);
    });
  }

  async loadAll(entries: readonly LearnedMapping[]): Promise<void> {
    await this.maybeMigrate();
    if (entries.length === 0) return;
    // UPSERT every row. For large bulk-loads consider COPY FROM, but the
    // engineer-driven correction stream is small (hundreds, not millions).
    const sql = `
      INSERT INTO ${this.tableQualified}
        (system, source_column, canonical, entity, accept_count, last_accepted_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (system, source_column, canonical) DO UPDATE
        SET accept_count     = EXCLUDED.accept_count,
            last_accepted_at = EXCLUDED.last_accepted_at,
            entity           = EXCLUDED.entity
    `;
    await this.withClient(async (client) => {
      for (const e of entries) {
        await client.query(sql, [
          e.system,
          e.sourceColumn,
          e.canonical,
          e.entity,
          e.acceptCount,
          e.lastAcceptedAt,
        ]);
      }
    });
  }

  async size(): Promise<number> {
    await this.maybeMigrate();
    // size() counts distinct (system, source_column) — matches
    // MemoryLearningStore semantics.
    const sql = `
      SELECT COUNT(DISTINCT (system, source_column))::int AS n
        FROM ${this.tableQualified}
    `;
    return this.withClient(async (client) => {
      const res = await client.query<{ n: number }>(sql);
      return res.rows[0]?.n ?? 0;
    });
  }

  async clear(): Promise<void> {
    await this.maybeMigrate();
    await this.withClient(async (client) => {
      await client.query(`TRUNCATE ${this.tableQualified}`);
    });
  }

  /* ----------------------------- internals -------------------------------- */

  private idxNameFor(suffix: string): string {
    const base = this.tableRaw.split(".").pop() ?? "databridge_learning";
    return `ix_${base}_${suffix}`;
  }

  private async maybeMigrate(): Promise<void> {
    if (this.autoMigrate && !this.migrated) await this.ensureSchema();
  }

  private async withClient<T>(
    fn: (client: PgClientLike) => Promise<T>,
  ): Promise<T> {
    const client = await this.makeClient();
    await client.connect();
    try {
      return await fn(client);
    } finally {
      try {
        await client.end();
      } catch {
        // swallow — cleanup must never mask the real error
      }
    }
  }

  private async makeClient(): Promise<PgClientLike> {
    const config: Record<string, unknown> = this.opts.connectionString
      ? { connectionString: this.opts.connectionString }
      : (this.opts.clientConfig ?? {});

    if (this.opts.clientFactory) {
      return this.opts.clientFactory(config);
    }
    const { Client } = await loadPg();
    return new Client(config);
  }
}

/* ---------------------------- row marshalling ------------------------------ */

interface PgRow {
  system: string;
  source_column: string;
  canonical: string;
  entity: string;
  accept_count: number;
  last_accepted_at: Date | string;
}

function rowToMapping(row: PgRow): LearnedMapping {
  return {
    system: row.system as CrosswalkSystem,
    sourceColumn: row.source_column,
    canonical: row.canonical,
    entity: row.entity,
    acceptCount: Number(row.accept_count),
    lastAcceptedAt:
      row.last_accepted_at instanceof Date
        ? row.last_accepted_at.toISOString()
        : new Date(row.last_accepted_at).toISOString(),
  };
}
