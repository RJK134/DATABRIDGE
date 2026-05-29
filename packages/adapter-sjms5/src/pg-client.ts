/**
 * Lazy-loaded pg client wrapper.
 *
 * pg is declared as an OPTIONAL peer dependency so the workspace remains
 * installable on machines without native Postgres tooling. The consuming app
 * (apps/api, migration runners) must install pg explicitly:
 *   pnpm add pg @types/pg
 *
 * The wrapper exposes only the surface we use: a connectable client with
 * query() and a cursor for streaming. We deliberately do not expose a Pool
 * here — each Sjms5Adapter call is short-lived enough that one client per
 * call is fine, and avoids pool-lifecycle surprises with serverless deploys.
 */

// Structural interface — keeps us decoupled from @types/pg at compile time.
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

export interface PgModuleLike {
  Client: PgClientCtor;
  default?: { Client: PgClientCtor };
}

/**
 * Dynamically import pg. Throws a clear error if pg is not installed.
 */
export async function loadPg(): Promise<{ Client: PgClientCtor }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import("pg" as any)) as PgModuleLike;
    const Client = mod.Client ?? mod.default?.Client;
    if (!Client) {
      throw new Error("pg module did not export Client");
    }
    return { Client };
  } catch (err) {
    throw new Error(
      "@databridge/adapter-sjms5: the optional peer 'pg' is not installed. " +
        "Install it in the consuming app with: pnpm add pg @types/pg\n" +
        `Underlying error: ${(err as Error).message}`
    );
  }
}
