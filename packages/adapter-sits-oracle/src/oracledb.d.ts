/**
 * Minimal ambient declaration for the optional `oracledb` peer dependency.
 *
 * The full type surface of `oracledb` is large and version-fluid. We declare
 * only the symbols the adapter actually uses, treating everything else as
 * `unknown`. Consumers who want richer typing can install their own
 * `oracledb` types in their app.
 */
declare module "oracledb" {
  export const OUT_FORMAT_OBJECT: number;
  export function initOracleClient(opts?: { libDir?: string }): void;
  export function createPool(config: {
    connectString: string;
    user: string;
    password: string;
    poolMax?: number;
    poolMin?: number;
    [key: string]: unknown;
  }): Promise<OraclePool>;

  export interface OraclePool {
    getConnection(): Promise<OracleConnection>;
    close(drainSeconds: number): Promise<void>;
  }

  export interface OracleConnection {
    execute(
      sql: string,
      binds?: Record<string, unknown>,
      opts?: Record<string, unknown>
    ): Promise<{ rows?: unknown[] }>;
    close(): Promise<void>;
  }

  const _default: {
    OUT_FORMAT_OBJECT: number;
    initOracleClient: typeof initOracleClient;
    createPool: typeof createPool;
  };
  export default _default;
}
