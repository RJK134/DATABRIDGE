/**
 * PgSqlExecutor tests
 *
 * We use the injectable clientFactory hook to substitute a fake pg client.
 * The fake records every SQL string and param array, and returns canned rows.
 * No real Postgres is touched.
 */

import { describe, expect, it } from "vitest";

import {
  PgSqlExecutor,
  translateNamedBinds,
  type PgClientLike,
} from "../sql-executor-pg.js";

/* ----------------------------- fake client --------------------------------- */

interface QueryCall {
  sql: string;
  params: ReadonlyArray<unknown> | undefined;
}

interface FakeClientHandle {
  client: PgClientLike;
  calls: QueryCall[];
  connectCount: number;
  endCount: number;
}

function makeFakeClient(
  responder: (call: QueryCall) => { rows: Record<string, unknown>[] },
): FakeClientHandle {
  const calls: QueryCall[] = [];
  let connectCount = 0;
  let endCount = 0;

  const client: PgClientLike = {
    async connect() {
      connectCount++;
    },
    async query<T = Record<string, unknown>>(
      sql: string,
      params?: ReadonlyArray<unknown>,
    ) {
      const call: QueryCall = { sql, params };
      calls.push(call);
      const res = responder(call);
      return { rows: res.rows as T[], rowCount: res.rows.length };
    },
    async end() {
      endCount++;
    },
  };

  return {
    client,
    calls,
    get connectCount() {
      return connectCount;
    },
    get endCount() {
      return endCount;
    },
  } as unknown as FakeClientHandle;
}

/* ----------------------- translateNamedBinds suite ------------------------- */

describe("translateNamedBinds", () => {
  it("replaces :name with $N in declaration order", () => {
    const { sql, values } = translateNamedBinds(
      "SELECT * FROM t WHERE a = :foo AND b = :bar",
      { foo: 1, bar: "x" },
    );
    expect(sql).toBe("SELECT * FROM t WHERE a = $1 AND b = $2");
    expect(values).toEqual([1, "x"]);
  });

  it("de-duplicates repeated names to the same $N", () => {
    const { sql, values } = translateNamedBinds(
      "SELECT 1 FROM t WHERE a = :tenantId OR b = :tenantId",
      { tenantId: "t1" },
    );
    expect(sql).toBe("SELECT 1 FROM t WHERE a = $1 OR b = $1");
    expect(values).toEqual(["t1"]);
  });

  it("ignores colons inside single-quoted strings", () => {
    const { sql, values } = translateNamedBinds(
      "SELECT ':notabind' AS lit, :foo AS bind",
      { foo: 7 },
    );
    expect(sql).toBe("SELECT ':notabind' AS lit, $1 AS bind");
    expect(values).toEqual([7]);
  });

  it("preserves :: casts", () => {
    const { sql, values } = translateNamedBinds(
      "SELECT :x::text AS y",
      { x: 1 },
    );
    expect(sql).toBe("SELECT $1::text AS y");
    expect(values).toEqual([1]);
  });

  it("throws on missing param", () => {
    expect(() =>
      translateNamedBinds("WHERE a = :missing", {}),
    ).toThrow(/missing parameter ':missing'/);
  });

  it("handles escaped '' inside strings", () => {
    const { sql, values } = translateNamedBinds(
      "SELECT 'it''s :fine' AS s, :name AS n",
      { name: "real" },
    );
    expect(sql).toBe("SELECT 'it''s :fine' AS s, $1 AS n");
    expect(values).toEqual(["real"]);
  });
});

/* ------------------------------ query() ----------------------------------- */

describe("PgSqlExecutor.query", () => {
  it("translates binds and forwards rows", async () => {
    const handle = makeFakeClient(() => ({
      rows: [{ subject_id: "s1", value: "X" }],
    }));
    const exec = new PgSqlExecutor({
      clientFactory: () => handle.client,
    });

    const rows = await exec.query(
      "SELECT subject_id, value FROM students WHERE tenant = :tenantId AND code = :codeId",
      { tenantId: "t1", codeId: "C1" },
    );

    expect(rows).toEqual([{ subject_id: "s1", value: "X" }]);
    expect(handle.calls).toHaveLength(1);
    expect(handle.calls[0]?.sql).toBe(
      "SELECT subject_id, value FROM students WHERE tenant = $1 AND code = $2",
    );
    expect(handle.calls[0]?.params).toEqual(["t1", "C1"]);
    expect(handle.connectCount).toBe(1);
    expect(handle.endCount).toBe(1);
  });

  it("closes client even when query throws", async () => {
    const handle = makeFakeClient(() => {
      throw new Error("boom");
    });
    const exec = new PgSqlExecutor({ clientFactory: () => handle.client });
    await expect(
      exec.query("SELECT 1 WHERE t = :tenantId", { tenantId: "t1" }),
    ).rejects.toThrow("boom");
    expect(handle.endCount).toBe(1);
  });
});

/* ------------------------- queryCodelistViolations ------------------------- */

describe("PgSqlExecutor.queryCodelistViolations", () => {
  it("builds a NOT-IN-codes query when codes provided", async () => {
    const handle = makeFakeClient(() => ({
      rows: [{ subject_id: "s9", field: "STU.code", value: "BAD" }],
    }));
    const exec = new PgSqlExecutor({ clientFactory: () => handle.client });

    const rows = await exec.queryCodelistViolations(
      "STU.code",
      new Set(["A", "B"]),
      false,
      "tenant-1",
    );

    expect(rows).toEqual([
      { subject_id: "s9", field: "STU.code", value: "BAD" },
    ]);
    const call = handle.calls[0]!;
    expect(call.sql).toContain('FROM "STU"');
    expect(call.sql).toContain('"code"');
    expect(call.sql).toContain("<> ALL($2::text[])");
    expect(call.sql).not.toContain("IS NULL");
    expect(call.params).toEqual(["tenant-1", ["A", "B"]]);
  });

  it("includes IS NULL clause when flagNulls=true with codes", async () => {
    const handle = makeFakeClient(() => ({ rows: [] }));
    const exec = new PgSqlExecutor({ clientFactory: () => handle.client });

    await exec.queryCodelistViolations(
      "STU.code",
      new Set(["A"]),
      true,
      "t1",
    );
    expect(handle.calls[0]?.sql).toContain("OR \"code\" IS NULL");
  });

  it("when no codes, scans all values; with flagNulls=false adds IS NOT NULL filter", async () => {
    const handle = makeFakeClient(() => ({ rows: [] }));
    const exec = new PgSqlExecutor({ clientFactory: () => handle.client });

    await exec.queryCodelistViolations("STU.code", new Set(), false, "t1");
    const sql = handle.calls[0]!.sql;
    expect(sql).toContain('"code" IS NOT NULL');
    expect(handle.calls[0]?.params).toEqual(["t1"]);
  });

  it("supports schema-qualified field paths", async () => {
    const handle = makeFakeClient(() => ({ rows: [] }));
    const exec = new PgSqlExecutor({ clientFactory: () => handle.client });

    await exec.queryCodelistViolations(
      "audit.STU.code",
      new Set(["X"]),
      false,
      "t1",
    );
    expect(handle.calls[0]?.sql).toContain('FROM "audit"."STU"');
  });

  it("refuses unsafe identifiers", async () => {
    const handle = makeFakeClient(() => ({ rows: [] }));
    const exec = new PgSqlExecutor({ clientFactory: () => handle.client });
    await expect(
      exec.queryCodelistViolations("STU.col;DROP", new Set(["A"]), false, "t1"),
    ).rejects.toThrow(/unsafe identifier/);
  });
});

/* ---------------------------- queryFieldStats ----------------------------- */

describe("PgSqlExecutor.queryFieldStats", () => {
  it("returns nullPct, cardinality, min/max, and top values", async () => {
    const handle = makeFakeClient((call) => {
      if (call.sql.includes("ORDER BY count DESC")) {
        return {
          rows: [
            { value: "A", count: "8" },
            { value: "B", count: "2" },
          ],
        };
      }
      return {
        rows: [
          {
            total: "10",
            nulls: "2",
            cardinality: "2",
            min_v: "A",
            max_v: "B",
          },
        ],
      };
    });
    const exec = new PgSqlExecutor({ clientFactory: () => handle.client });

    const stats = await exec.queryFieldStats("STU.code", "t1");
    expect(stats.nullPct).toBe(20);
    expect(stats.cardinality).toBe(2);
    expect(stats.min).toBe("A");
    expect(stats.max).toBe("B");
    expect(stats.topValues).toEqual([
      { value: "A", count: 8 },
      { value: "B", count: 2 },
    ]);
  });

  it("handles empty tables (nullPct = 0)", async () => {
    const handle = makeFakeClient((call) => {
      if (call.sql.includes("ORDER BY count DESC")) {
        return { rows: [] };
      }
      return {
        rows: [
          {
            total: "0",
            nulls: "0",
            cardinality: "0",
            min_v: null,
            max_v: null,
          },
        ],
      };
    });
    const exec = new PgSqlExecutor({ clientFactory: () => handle.client });
    const stats = await exec.queryFieldStats("STU.code", "t1");
    expect(stats.nullPct).toBe(0);
    expect(stats.cardinality).toBe(0);
    expect(stats.min).toBeUndefined();
    expect(stats.max).toBeUndefined();
    expect(stats.topValues).toEqual([]);
  });
});

/* ---------------------------- pg lazy-load ------------------------------- */

describe("PgSqlExecutor without clientFactory", () => {
  it("surfaces underlying errors verbatim (not silenced)", async () => {
    // We don't assert a specific message here — depending on whether pg is
    // hoisted into node_modules, the lazy import either fails (with our
    // clear 'optional peer' message) or succeeds and pg tries to connect
    // to the bogus host. Either way the call must reject.
    const exec = new PgSqlExecutor({ connectionString: "postgres://nope.invalid:1/x" });
    await expect(
      exec.query("SELECT 1 WHERE t = :tenantId", { tenantId: "t1" }),
    ).rejects.toThrow();
  });
});
