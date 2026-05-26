/**
 * PostgresLearningStore tests — exercises the pg-backed async store via
 * an injected client factory. We don't hit a real Postgres in CI; instead
 * a recording fake captures every query + params so we can assert on the
 * exact SQL emitted (DDL idempotency, normalised lookup, ON CONFLICT
 * upsert, dumpAll ordering, bulk loadAll, size, TRUNCATE clear).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PostgresLearningStore,
  type PgLearningClientLike,
  type LearnedMapping,
} from "../index.js";
import type { CrosswalkSystem } from "../types.js";

interface RecordedCall {
  sql: string;
  params: ReadonlyArray<unknown>;
}

interface QueryHandler {
  (sql: string, params?: ReadonlyArray<unknown>):
    | { rows: unknown[]; rowCount?: number | null }
    | Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

class FakeClient implements PgLearningClientLike {
  public connected = false;
  public ended = false;
  public readonly calls: RecordedCall[] = [];

  constructor(private handler: QueryHandler) {}

  async connect(): Promise<void> {
    this.connected = true;
  }
  async query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params: params ?? [] });
    const out = await this.handler(sql, params);
    return out as { rows: T[]; rowCount?: number | null };
  }
  async end(): Promise<void> {
    this.ended = true;
  }
}

/** A tiny in-memory simulator for the cases where we need real upsert behaviour. */
function makeSimulator() {
  const store = new Map<string, LearnedMapping>();
  const keyOf = (system: string, sourceColumn: string, canonical: string) =>
    `${system}::${sourceColumn.trim().toLowerCase()}::${canonical}`;

  const handler: QueryHandler = (sql, params = []) => {
    const upper = sql.trim().toUpperCase();
    if (upper.startsWith("CREATE TABLE")) return { rows: [], rowCount: 0 };
    if (upper.startsWith("TRUNCATE")) {
      store.clear();
      return { rows: [], rowCount: 0 };
    }
    if (upper.startsWith("INSERT")) {
      // record() emits 5 params: (system, sourceColumn, canonical, entity, at)
      // loadAll() emits 6 params: (system, sourceColumn, canonical, entity, acceptCount, at)
      const isRecord = sql.includes("accept_count + 1");
      const system = params[0] as string;
      const sourceColumn = params[1] as string;
      const canonical = params[2] as string;
      const entity = params[3] as string;
      const acceptCount = isRecord ? 1 : (params[4] as number);
      const lastAcceptedAt = isRecord
        ? (params[4] as string)
        : (params[5] as string);
      const key = keyOf(system, sourceColumn, canonical);
      const existing = store.get(key);
      const next: LearnedMapping = existing
        ? {
            system: existing.system,
            sourceColumn: existing.sourceColumn,
            canonical,
            entity,
            acceptCount: isRecord ? existing.acceptCount + 1 : acceptCount,
            lastAcceptedAt,
          }
        : {
            system: system as CrosswalkSystem,
            sourceColumn,
            canonical,
            entity,
            acceptCount,
            lastAcceptedAt,
          };
      store.set(key, next);
      return {
        rows: [
          {
            system: next.system,
            source_column: next.sourceColumn,
            canonical: next.canonical,
            entity: next.entity,
            accept_count: next.acceptCount,
            last_accepted_at: next.lastAcceptedAt,
          },
        ],
        rowCount: 1,
      };
    }
    if (upper.startsWith("SELECT COUNT")) {
      const distinct = new Set<string>();
      for (const m of store.values())
        distinct.add(`${m.system}::${m.sourceColumn.trim().toLowerCase()}`);
      return { rows: [{ n: distinct.size }], rowCount: 1 };
    }
    if (upper.startsWith("SELECT")) {
      // dumpAll OR lookup
      if (sql.includes("WHERE system = $1")) {
        const [system, sourceColumn] = params as [string, string];
        const norm = sourceColumn.trim().toLowerCase();
        const candidates: LearnedMapping[] = [];
        for (const m of store.values()) {
          if (m.system === system && m.sourceColumn.trim().toLowerCase() === norm)
            candidates.push(m);
        }
        candidates.sort(
          (a, b) =>
            b.acceptCount - a.acceptCount ||
            b.lastAcceptedAt.localeCompare(a.lastAcceptedAt),
        );
        const top = candidates[0];
        return {
          rows: top
            ? [
                {
                  system: top.system,
                  source_column: top.sourceColumn,
                  canonical: top.canonical,
                  entity: top.entity,
                  accept_count: top.acceptCount,
                  last_accepted_at: top.lastAcceptedAt,
                },
              ]
            : [],
          rowCount: top ? 1 : 0,
        };
      }
      // dumpAll ordered
      const all = [...store.values()].sort(
        (a, b) =>
          a.system.localeCompare(b.system) ||
          a.sourceColumn.localeCompare(b.sourceColumn) ||
          a.canonical.localeCompare(b.canonical),
      );
      return {
        rows: all.map((m) => ({
          system: m.system,
          source_column: m.sourceColumn,
          canonical: m.canonical,
          entity: m.entity,
          accept_count: m.acceptCount,
          last_accepted_at: m.lastAcceptedAt,
        })),
        rowCount: all.length,
      };
    }
    return { rows: [], rowCount: 0 };
  };
  return { handler, store };
}

let clients: FakeClient[] = [];
beforeEach(() => {
  clients = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

function buildStore(handler?: QueryHandler) {
  const h = handler ?? makeSimulator().handler;
  const factory = (_cfg: Record<string, unknown>) => {
    const c = new FakeClient(h);
    clients.push(c);
    return c;
  };
  return new PostgresLearningStore({
    connectionString: "postgres://test",
    clientFactory: factory,
  });
}

describe("PostgresLearningStore", () => {
  it("ensureSchema emits CREATE TABLE IF NOT EXISTS and CREATE INDEX, and is idempotent across calls", async () => {
    const { handler } = makeSimulator();
    const store = buildStore(handler);
    await store.ensureSchema();
    await store.ensureSchema();
    // First client recorded the DDL; second call is a no-op (cached).
    expect(clients).toHaveLength(1);
    const ddlCall = clients[0]!.calls[0]!;
    expect(ddlCall.sql).toMatch(/CREATE TABLE IF NOT EXISTS/);
    expect(ddlCall.sql).toMatch(/CREATE INDEX IF NOT EXISTS/);
    expect(ddlCall.sql).toMatch(/PRIMARY KEY \(system, source_column, canonical\)/);
  });

  it("lookup uses normalised column matching (lower(btrim(...)))", async () => {
    const { handler } = makeSimulator();
    const store = buildStore(handler);
    await store.record({
      system: "sits",
      sourceColumn: "Stu_ID",
      canonical: "Person.studentId",
      entity: "Person",
    });
    const hit = await store.lookup("sits", "  stu_id  ");
    expect(hit?.canonical).toBe("Person.studentId");
    // Verify the SELECT used the normalised predicate
    const selectCall = clients
      .flatMap((c) => c.calls)
      .find((c) => /^\s*SELECT/.test(c.sql) && c.sql.includes("WHERE system"));
    expect(selectCall?.sql).toMatch(/lower\(btrim\(source_column\)\) = lower\(btrim\(\$2\)\)/);
  });

  it("record() emits INSERT ... ON CONFLICT DO UPDATE and increments accept_count", async () => {
    const { handler } = makeSimulator();
    const store = buildStore(handler);
    const first = await store.record({
      system: "sits",
      sourceColumn: "stu_id",
      canonical: "Person.studentId",
      entity: "Person",
      at: new Date("2026-05-26T10:00:00.000Z"),
    });
    const second = await store.record({
      system: "sits",
      sourceColumn: "stu_id",
      canonical: "Person.studentId",
      entity: "Person",
      at: new Date("2026-05-26T11:00:00.000Z"),
    });
    expect(first.acceptCount).toBe(1);
    expect(second.acceptCount).toBe(2);
    const insertCall = clients
      .flatMap((c) => c.calls)
      .find((c) => /^\s*INSERT/i.test(c.sql));
    expect(insertCall?.sql).toMatch(
      /ON CONFLICT \(system, source_column, canonical\) DO UPDATE/,
    );
    expect(insertCall?.sql).toMatch(/accept_count\s*\+\s*1/);
  });

  it("dumpAll returns rows ordered by (system, source_column, canonical)", async () => {
    const { handler } = makeSimulator();
    const store = buildStore(handler);
    await store.record({
      system: "sits",
      sourceColumn: "z_col",
      canonical: "Z.zzz",
      entity: "Z",
    });
    await store.record({
      system: "banner",
      sourceColumn: "a_col",
      canonical: "A.aaa",
      entity: "A",
    });
    const all = await store.dumpAll();
    expect(all.map((m) => m.system)).toEqual(["banner", "sits"]);
    const dumpCall = clients
      .flatMap((c) => c.calls)
      .find(
        (c) =>
          /^\s*SELECT/.test(c.sql) &&
          c.sql.includes("ORDER BY system, source_column, canonical"),
      );
    expect(dumpCall).toBeDefined();
  });

  it("loadAll bulk-upserts every entry (verbatim acceptCount preserved)", async () => {
    const { handler } = makeSimulator();
    const store = buildStore(handler);
    const fixtures: LearnedMapping[] = [
      {
        system: "sits",
        sourceColumn: "stu_id",
        canonical: "Person.studentId",
        entity: "Person",
        acceptCount: 7,
        lastAcceptedAt: "2026-05-20T08:00:00.000Z",
      },
      {
        system: "banner",
        sourceColumn: "spriden_id",
        canonical: "Person.studentId",
        entity: "Person",
        acceptCount: 3,
        lastAcceptedAt: "2026-05-21T08:00:00.000Z",
      },
    ];
    await store.loadAll(fixtures);
    const all = await store.dumpAll();
    expect(all).toHaveLength(2);
    const sits = all.find((m) => m.system === "sits");
    expect(sits?.acceptCount).toBe(7);
  });

  it("size() returns the count of distinct (system, source_column) pairs", async () => {
    const { handler } = makeSimulator();
    const store = buildStore(handler);
    await store.record({
      system: "sits",
      sourceColumn: "stu_id",
      canonical: "Person.studentId",
      entity: "Person",
    });
    await store.record({
      system: "sits",
      sourceColumn: "stu_id",
      canonical: "Application.studentId",
      entity: "Application",
    });
    await store.record({
      system: "banner",
      sourceColumn: "spriden_id",
      canonical: "Person.studentId",
      entity: "Person",
    });
    const n = await store.size();
    // 2 distinct (system, sourceColumn) pairs even though 3 canonical mappings exist
    expect(n).toBe(2);
    const countCall = clients
      .flatMap((c) => c.calls)
      .find((c) => /^\s*SELECT COUNT/i.test(c.sql));
    expect(countCall?.sql).toMatch(/COUNT\(DISTINCT \(system, source_column\)\)/);
  });

  it("clear() emits TRUNCATE", async () => {
    const { handler } = makeSimulator();
    const store = buildStore(handler);
    await store.record({
      system: "sits",
      sourceColumn: "stu_id",
      canonical: "Person.studentId",
      entity: "Person",
    });
    await store.clear();
    expect(await store.size()).toBe(0);
    const truncateCall = clients
      .flatMap((c) => c.calls)
      .find((c) => /^\s*TRUNCATE/i.test(c.sql));
    expect(truncateCall).toBeDefined();
  });

  it("autoMigrate=false skips ensureSchema until called explicitly", async () => {
    const { handler } = makeSimulator();
    const factory = (_cfg: Record<string, unknown>) => {
      const c = new FakeClient(handler);
      clients.push(c);
      return c;
    };
    const store = new PostgresLearningStore({
      connectionString: "postgres://test",
      clientFactory: factory,
      autoMigrate: false,
    });
    await store.lookup("sits", "stu_id");
    const ddlCall = clients
      .flatMap((c) => c.calls)
      .find((c) => /CREATE TABLE/i.test(c.sql));
    expect(ddlCall).toBeUndefined();
    await store.ensureSchema();
    const ddlAfter = clients
      .flatMap((c) => c.calls)
      .find((c) => /CREATE TABLE/i.test(c.sql));
    expect(ddlAfter).toBeDefined();
  });

  it("rejects unsafe table identifiers", () => {
    expect(
      () =>
        new PostgresLearningStore({
          connectionString: "postgres://test",
          tableName: "drop; --",
        }),
    ).toThrow(/unsafe identifier/);
  });

  it("schema-qualified table names are quoted correctly", async () => {
    const { handler } = makeSimulator();
    const factory = (_cfg: Record<string, unknown>) => {
      const c = new FakeClient(handler);
      clients.push(c);
      return c;
    };
    const store = new PostgresLearningStore({
      connectionString: "postgres://test",
      clientFactory: factory,
      tableName: "audit.databridge_learning",
    });
    await store.ensureSchema();
    const ddlCall = clients[0]!.calls[0]!;
    expect(ddlCall.sql).toMatch(/"audit"\."databridge_learning"/);
  });

  it("cleans up the client even when a query throws", async () => {
    const failing: QueryHandler = (sql) => {
      if (/CREATE TABLE/.test(sql)) return { rows: [], rowCount: 0 };
      throw new Error("boom");
    };
    const store = buildStore(failing);
    await expect(store.lookup("sits", "stu_id")).rejects.toThrow(/boom/);
    expect(clients[0]!.ended).toBe(true);
  });
});
