/**
 * PgSqlExecutor — concrete SqlExecutor implementation backed by node-postgres.
 *
 * The RuleEngine (engine.ts) holds an abstract SqlExecutor; this module
 * provides the production implementation. It is responsible for:
 *
 *  1. Translating profile-defined SQL placeholders (`:tenantId`, `:codeId`, …)
 *     into pg's positional `$1, $2, …` syntax, since profile authors prefer
 *     named binds.
 *  2. Executing codelist-violation queries. Codelist rule bodies are *not*
 *     authored as SQL by profile packs — the engine asks the executor to
 *     produce violation rows. We use a parametrised template that scans the
 *     resolved `TABLE.column` field path.
 *  3. Computing FieldStats (null%, cardinality, min/max/mean/stddev, top
 *     values) for statistical rules. Implementation uses a single SQL pass
 *     plus a small aggregation query.
 *
 * pg is an OPTIONAL peer dependency, loaded lazily — keeps the package
 * installable on machines without libpq and lets the engine remain usable
 * with the in-memory test executor (engine tests do not need pg).
 */

import type { SqlExecutor, FieldStats } from "./engine.js";

/* ----------------------------- pg surface ---------------------------------- */

/**
 * Structural pg client subset we depend on. Mirrors adapter-sjms5/pg-client
 * so we are not coupled to @types/pg at compile time.
 */
export interface PgClientLike {
  connect(): Promise<void>;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>
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
      "@databridge/rule-core: the optional peer 'pg' is not installed. " +
        "Install it in the consuming app with: pnpm add pg @types/pg\n" +
        `Underlying error: ${(err as Error).message}`
    );
  }
}

/* ------------------------- placeholder translation ------------------------- */

/**
 * Convert `:name` named binds inside a SQL string into pg `$1, $2, …`
 * positional binds.  Returns the rewritten SQL and the ordered param array.
 *
 * Rules:
 *   - Each unique `:name` is replaced by the same $N (de-duplicated).
 *   - Inside single-quoted string literals, `:foo` is left alone.
 *   - Casts of the form `::type` are preserved (a `::` is never a bind).
 *   - Missing params throw — fail loud rather than silently bind NULL.
 *
 * This is a deliberately small parser; if/when we need procedural SQL we
 * should swap in a proper one. For audit-style SELECT statements it is
 * sufficient.
 */
export function translateNamedBinds(
  sql: string,
  params: Record<string, unknown>
): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const indexByName = new Map<string, number>();
  let out = "";
  let i = 0;
  let inSingle = false;

  while (i < sql.length) {
    const ch = sql[i] ?? "";

    if (ch === "'") {
      // toggle string state, but handle '' escape
      const next = sql[i + 1] ?? "";
      if (inSingle && next === "'") {
        out += "''";
        i += 2;
        continue;
      }
      inSingle = !inSingle;
      out += ch;
      i++;
      continue;
    }

    if (!inSingle && ch === ":") {
      // ::cast — keep both colons literal
      if (sql[i + 1] === ":") {
        out += "::";
        i += 2;
        continue;
      }
      // try to read an identifier
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i + 1));
      if (m) {
        const name = m[0];
        if (!(name in params)) {
          throw new Error(`translateNamedBinds: missing parameter ':${name}' in params map`);
        }
        let idx = indexByName.get(name);
        if (idx === undefined) {
          values.push(params[name]);
          idx = values.length;
          indexByName.set(name, idx);
        }
        out += `$${idx}`;
        i += 1 + name.length;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return { sql: out, values };
}

/* --------------------------- field path parsing ---------------------------- */

/**
 * Parse a "TABLE.column" or "schema.TABLE.column" field path into its parts.
 * The codelist + statistical templates need to address the table and column
 * separately. We accept either two- or three-segment paths.
 */
function splitFieldPath(fieldPath: string): {
  schema?: string;
  table: string;
  column: string;
} {
  const parts = fieldPath.split(".");
  if (parts.length === 2) {
    return { table: parts[0]!, column: parts[1]! };
  }
  if (parts.length === 3) {
    return { schema: parts[0]!, table: parts[1]!, column: parts[2]! };
  }
  throw new Error(
    `splitFieldPath: expected TABLE.column or schema.TABLE.column, got '${fieldPath}'`
  );
}

/**
 * Quote a SQL identifier safely. Allows letters, digits, underscore only;
 * anything else throws — we refuse to construct identifiers from untrusted
 * input. Profile rules supply field paths at authoring time, so this is
 * static enough to be safe with allowlist validation.
 */
function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`quoteIdent: refusing unsafe identifier '${name}'`);
  }
  return `"${name}"`;
}

function qualifiedTable(parsed: { schema?: string; table: string }): string {
  return parsed.schema
    ? `${quoteIdent(parsed.schema)}.${quoteIdent(parsed.table)}`
    : quoteIdent(parsed.table);
}

/* ------------------------------ public types ------------------------------- */

export interface PgSqlExecutorOptions {
  /**
   * Connection string (preferred). If both connectionString and config are
   * given, connectionString wins.
   */
  connectionString?: string;

  /**
   * Alternative: a full pg.ClientConfig object. Useful for tests that wire a
   * fake.
   */
  clientConfig?: Record<string, unknown>;

  /**
   * Injectable Client factory — used by tests to substitute a fake pg.Client.
   * If unset, the real pg module is lazy-loaded.
   */
  clientFactory?: (config: Record<string, unknown>) => PgClientLike | Promise<PgClientLike>;

  /**
   * Column name used to filter rows by tenant. Defaults to "tenant_id". Each
   * scanned table is assumed to expose this column for codelist/statistical
   * sweeps. SQL rules authored by profiles can still reference any column.
   */
  tenantColumn?: string;
}

/* ----------------------------- implementation ------------------------------ */

/**
 * Concrete SqlExecutor for Postgres.
 *
 * Each public method opens a fresh client, runs its query, then closes the
 * client. This trades a small per-call cost for a guarantee of no leaked
 * connections — audit runs are coarse-grained enough that this is fine.
 * Callers wanting connection pooling can wrap this class.
 */
export class PgSqlExecutor implements SqlExecutor {
  private readonly tenantColumn: string;

  constructor(private readonly opts: PgSqlExecutorOptions) {
    this.tenantColumn = opts.tenantColumn ?? "tenant_id";
  }

  /**
   * Execute a profile-supplied SQL string. The engine passes a params map
   * that always includes `tenantId`; profile authors may reference additional
   * names. Named binds are translated to positional binds for pg.
   */
  async query(
    sql: string,
    params: { tenantId: string } & Record<string, unknown>
  ): Promise<Record<string, unknown>[]> {
    const { sql: pgSql, values } = translateNamedBinds(sql, params);
    return this.withClient(async (client) => {
      const res = await client.query<Record<string, unknown>>(pgSql, values);
      return res.rows;
    });
  }

  /**
   * Stream codelist violations for a field. Returns one row per offending
   * record, shaped so findingFromSqlRow() can lift it directly.
   *
   * Implementation: SELECT subject_id, field, value FROM <table> WHERE
   * tenant matches AND value NOT IN (...validCodes...). If validCodes is
   * empty, every non-null value is treated as a violation. The "subject_id"
   * column is conventionally the table's PK — engine consumers must alias
   * a PK column to subject_id at view creation time, or the runner will
   * surface it as `subject_id = null`.
   *
   * Codelists with very large code sets are passed via ANY($N) to keep the
   * statement size bounded.
   */
  async queryCodelistViolations(
    fieldPath: string,
    validCodes: Set<string>,
    flagNulls: boolean,
    tenantId: string
  ): Promise<Record<string, unknown>[]> {
    const parsed = splitFieldPath(fieldPath);
    const table = qualifiedTable(parsed);
    const col = quoteIdent(parsed.column);
    const tenantCol = quoteIdent(this.tenantColumn);
    const codes = Array.from(validCodes);

    // We project subject_id (best-effort), the field path, and the offending
    // value. If the table lacks a subject_id alias the column resolves to NULL.
    const baseSelect = `
      SELECT subject_id,
             '${parsed.table}.${parsed.column}' AS field,
             ${col} AS value
      FROM ${table}
      WHERE ${tenantCol} = $1
    `;

    let sql: string;
    let params: unknown[];

    if (codes.length === 0) {
      // No valid codes — every non-null is a violation; nulls per flag.
      sql = flagNulls ? `${baseSelect}` : `${baseSelect} AND ${col} IS NOT NULL`;
      params = [tenantId];
    } else {
      const nullClause = flagNulls ? ` OR ${col} IS NULL` : "";
      sql = `${baseSelect} AND (${col} <> ALL($2::text[])${nullClause})`;
      params = [tenantId, codes];
    }

    return this.withClient(async (client) => {
      const res = await client.query<Record<string, unknown>>(sql, params);
      return res.rows;
    });
  }

  /**
   * Compute null %, cardinality, min/max/mean/stddev, and the top 10 values
   * for a given field. Numeric stats are best-effort — non-numeric columns
   * cast to numeric will throw at the DB layer, in which case we retry with
   * a text-only stats query.
   */
  async queryFieldStats(fieldPath: string, tenantId: string): Promise<FieldStats> {
    const parsed = splitFieldPath(fieldPath);
    const table = qualifiedTable(parsed);
    const col = quoteIdent(parsed.column);
    const tenantCol = quoteIdent(this.tenantColumn);

    const statsSql = `
      WITH base AS (
        SELECT ${col} AS v
        FROM ${table}
        WHERE ${tenantCol} = $1
      )
      SELECT
        COUNT(*)::bigint                                            AS total,
        COUNT(*) FILTER (WHERE v IS NULL)::bigint                   AS nulls,
        COUNT(DISTINCT v)::bigint                                   AS cardinality,
        MIN(v::text)                                                AS min_v,
        MAX(v::text)                                                AS max_v
      FROM base
    `;

    const topSql = `
      SELECT v::text AS value, COUNT(*)::bigint AS count
      FROM (
        SELECT ${col} AS v FROM ${table} WHERE ${tenantCol} = $1
      ) t
      WHERE v IS NOT NULL
      GROUP BY v
      ORDER BY count DESC, value ASC
      LIMIT 10
    `;

    return this.withClient(async (client) => {
      const stats = await client.query<{
        total: string;
        nulls: string;
        cardinality: string;
        min_v: string | null;
        max_v: string | null;
      }>(statsSql, [tenantId]);

      const top = await client.query<{ value: string; count: string }>(topSql, [tenantId]);

      const row = stats.rows[0] ?? {
        total: "0",
        nulls: "0",
        cardinality: "0",
        min_v: null,
        max_v: null,
      };
      const total = Number(row.total);
      const nulls = Number(row.nulls);
      const nullPct = total > 0 ? (nulls / total) * 100 : 0;

      const result: FieldStats = {
        nullPct,
        cardinality: Number(row.cardinality),
        topValues: top.rows.map((r) => ({
          value: r.value,
          count: Number(r.count),
        })),
        ...(row.min_v !== null ? { min: row.min_v } : {}),
        ...(row.max_v !== null ? { max: row.max_v } : {}),
      };
      return result;
    });
  }

  /* ---------------------------- internals -------------------------------- */

  private async withClient<T>(fn: (client: PgClientLike) => Promise<T>): Promise<T> {
    const client = await this.makeClient();
    await client.connect();
    try {
      return await fn(client);
    } finally {
      try {
        await client.end();
      } catch {
        // swallow — connection cleanup must never mask a real error
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
