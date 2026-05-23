import type { SitsOracleConfig } from './config';
import { SitsOracleConfigSchema } from './config';
import { SITS_ENTITY_QUERIES } from './entity-queries';

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
 * SitsOracleAdapter
 * Reads data from a SITS Oracle database using the standard SITS view schema.
 * Uses oracledb connection pooling. The oracledb module is a peerDependency
 * so that consumers can control the native binary installation.
 */
export class SitsOracleAdapter implements SourceAdapter {
  private pool: unknown = null;
  private readonly config: SitsOracleConfig;

  constructor(rawConfig: unknown) {
    this.config = SitsOracleConfigSchema.parse(rawConfig);
  }

  async connect(): Promise<void> {
    // Dynamic import so module load does not fail in environments without oracledb
    const oracledb = await import('oracledb').catch(() => {
      throw new Error(
        '@databridge/adapter-sits-oracle: oracledb is required. Install it with: pnpm add oracledb',
      );
    });

    // Enable thick mode for full feature support (required for older SITS DB versions)
    try {
      (oracledb as any).default.initOracleClient();
    } catch {
      // Already initialised or thin mode — proceed
    }

    this.pool = await (oracledb as any).default.createPool({
      connectString: this.config.connectString,
      user: this.config.user,
      password: this.config.password,
      poolMax: this.config.poolMax,
      poolMin: this.config.poolMin,
    });
  }

  async fetchEntity(
    entity: string,
    options: FetchOptions = {},
  ): Promise<Record<string, unknown>[]> {
    if (!this.pool) throw new Error('SitsOracleAdapter: call connect() before fetchEntity()');

    const baseSql = SITS_ENTITY_QUERIES[entity];
    if (!baseSql) {
      throw new Error(`SitsOracleAdapter: no query defined for entity "${entity}"`);
    }

    let sql = baseSql.trim();
    if (options.whereClause) {
      sql += ` AND (${options.whereClause})`;
    }

    const oracledb = await import('oracledb');
    const conn = await (this.pool as any).getConnection();
    try {
      const result = await conn.execute(sql, options.bindParams ?? {}, {
        outFormat: (oracledb as any).default.OUT_FORMAT_OBJECT,
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
      await (this.pool as any).close(0);
      this.pool = null;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    if (!this.pool) return { ok: false, latencyMs: -1 };
    const start = Date.now();
    const conn = await (this.pool as any).getConnection().catch(() => null);
    if (!conn) return { ok: false, latencyMs: Date.now() - start };
    try {
      await conn.execute('SELECT 1 FROM DUAL');
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    } finally {
      await conn.close().catch(() => {});
    }
  }

  /**
   * Returns the list of entities this adapter can fetch.
   */
  supportedEntities(): string[] {
    return Object.keys(SITS_ENTITY_QUERIES);
  }
}
