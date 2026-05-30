import type { SitsOracleConfig } from "./config";
import { SitsOracleConfigSchema } from "./config";
import { SITS_ENTITY_QUERIES } from "./entity-queries";
import type * as OracleDb from "oracledb";

export interface SourceAdapter {
  connect(): Promise<void>;
  fetchEntity(entity: string, options?: FetchOptions): Promise<Record<string, unknown>[]>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number }>;
}

export interface FetchOptions {
  /** Additional WHERE clause fragment. Params bound via :param syntax. */
  whereClause?: string;
  bindParams?: Record<string, unknown>;
  /** Page size for streaming large tables. Default 1000. */
  batchSize?: number;
  /** Maximum rows to return. Useful for sampling/preview. */
  maxRows?: number;
}

/**
 * Lazily resolve the oracledb native module. The dependency is declared as an
 * OPTIONAL peerDependency so that consumers without an Oracle Instant Client
 * toolchain (e.g. CI runners, dev machines without Oracle workloads) can still
 * install the workspace. Anyone actually instantiating this adapter at runtime
 * must `pnpm add oracledb` in their app.
 */
async function loadOracleDb(): Promise<typeof OracleDb> {
  try {
    const mod = (await import("oracledb")) as unknown as typeof OracleDb & {
      default?: typeof OracleDb;
    };
    return mod.default ?? mod;
  } catch (err) {
    throw new Error(
      '@databridge/adapter-sits-oracle: the optional peer "oracledb" is not installed. ' +
        "Add it to the consuming app with: pnpm add oracledb. " +
        `Underlying error: ${(err as Error).message}`
    );
  }
}

/**
 * SitsOracleAdapter
 * Reads data from a SITS Oracle database using the standard SITS view schema.
 * Uses oracledb connection pooling. The oracledb module is an OPTIONAL
 * peerDependency so that the workspace can be installed on machines that do
 * not have the Oracle native client.
 */
export class SitsOracleAdapter implements SourceAdapter {
  private pool: unknown = null;
  private readonly config: SitsOracleConfig;

  constructor(rawConfig: unknown) {
    this.config = SitsOracleConfigSchema.parse(rawConfig);
  }

  async connect(): Promise<void> {
    const oracledb = await loadOracleDb();

    // Enable thick mode for full feature support (required for older SITS DB versions).
    // Swallow "already initialised" errors silently.
    try {
      (oracledb as unknown as { initOracleClient: () => void }).initOracleClient();
    } catch {
      // already initialised or running in thin mode — proceed
    }

    this.pool = await (
      oracledb as unknown as {
        createPool: (cfg: Record<string, unknown>) => Promise<unknown>;
      }
    ).createPool({
      connectString: this.config.connectString,
      user: this.config.user,
      password: this.config.password,
      poolMax: this.config.poolMax,
      poolMin: this.config.poolMin,
    });
  }

  async fetchEntity(
    entity: string,
    options: FetchOptions = {}
  ): Promise<Record<string, unknown>[]> {
    if (!this.pool) throw new Error("SitsOracleAdapter: call connect() before fetchEntity()");

    const baseSql = SITS_ENTITY_QUERIES[entity];
    if (!baseSql) {
      throw new Error(`SitsOracleAdapter: no query defined for entity "${entity}"`);
    }

    let sql = baseSql.trim();
    if (options.whereClause) {
      sql += ` AND (${options.whereClause})`;
    }

    const oracledb = await loadOracleDb();
    const conn = await (this.pool as { getConnection: () => Promise<OracleConn> }).getConnection();
    try {
      const result = await conn.execute(sql, options.bindParams ?? {}, {
        outFormat: (oracledb as unknown as { OUT_FORMAT_OBJECT: number }).OUT_FORMAT_OBJECT,
        maxRows: options.maxRows ?? 0, // 0 = unlimited
        fetchArraySize: options.batchSize ?? 1000,
        prefetchRows: options.batchSize ?? 1000,
      });
      return (result.rows ?? []) as Record<string, unknown>[];
    } finally {
      await conn.close();
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await (this.pool as { close: (drainSeconds: number) => Promise<void> }).close(0);
      this.pool = null;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    if (!this.pool) return { ok: false, latencyMs: -1 };
    const start = Date.now();
    const conn = await (this.pool as { getConnection: () => Promise<OracleConn> })
      .getConnection()
      .catch(() => null);
    if (!conn) return { ok: false, latencyMs: Date.now() - start };
    try {
      await conn.execute("SELECT 1 FROM DUAL", {}, {});
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    } finally {
      await conn.close().catch(() => {
        /* ignore */
      });
    }
  }

  /**
   * Returns the list of entities this adapter can fetch.
   */
  supportedEntities(): string[] {
    return Object.keys(SITS_ENTITY_QUERIES);
  }
}

/** Minimal structural type for an oracledb connection — keeps us decoupled from the native types. */
interface OracleConn {
  execute(
    sql: string,
    binds?: Record<string, unknown>,
    opts?: Record<string, unknown>
  ): Promise<{ rows?: unknown[] }>;
  close(): Promise<void>;
}
