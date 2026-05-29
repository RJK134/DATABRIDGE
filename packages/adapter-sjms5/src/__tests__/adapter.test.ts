/**
 * Sjms5Adapter tests — use an injected mock pg client so the adapter is
 * exercised end-to-end without standing up Postgres.
 */
import { describe, it, expect, vi } from "vitest";
import { Sjms5Adapter, SUPPORTED_RESOURCES, type PgClientFactory } from "../adapter.js";
import { Sjms5ConfigSchema } from "../config.js";
import type { PgClientLike } from "../pg-client.js";

interface MockExpectation {
  /** Regex matched against the SQL statement. */
  sqlMatch: RegExp;
  rows: Record<string, unknown>[];
}

function makeMockClient(expectations: MockExpectation[]): PgClientLike & {
  calls: { sql: string; params: ReadonlyArray<unknown> | undefined }[];
} {
  const calls: { sql: string; params: ReadonlyArray<unknown> | undefined }[] = [];
  let cursor = 0;
  return {
    calls,
    async connect() {
      return;
    },
    async query<T>(sql: string, params?: ReadonlyArray<unknown>) {
      calls.push({ sql, params });
      const expectation = expectations[cursor++];
      if (!expectation) {
        throw new Error(`mock pg: unexpected query #${cursor}: ${sql}`);
      }
      if (!expectation.sqlMatch.test(sql)) {
        throw new Error(`mock pg: query #${cursor} did not match ${expectation.sqlMatch}: ${sql}`);
      }
      return { rows: expectation.rows as T[], rowCount: expectation.rows.length };
    },
    async end() {
      return;
    },
  };
}

function makeCtx() {
  return {
    tenantId: "test-tenant",
    connectionId: "test-conn",
    secrets: { get: vi.fn(async () => "postgres://test/db") },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    signal: new AbortController().signal,
  };
}

const baseConfig = { databaseUrlSecretKey: "sjms5-database-url" };

describe("Sjms5Adapter — identity + config", () => {
  it("declares the correct identity and capabilities", () => {
    const adapter = new Sjms5Adapter(baseConfig);
    expect(adapter.id).toBe("sjms5");
    expect(adapter.displayName).toBe("SJMS 5 (Prisma/Postgres)");
    expect(adapter.capabilities.supportsSampling).toBe(true);
    expect(adapter.capabilities.supportsIncremental).toBe(true);
    expect(adapter.capabilities.preferredAuth).toBe("db-credentials");
  });

  it("config schema rejects an empty object", () => {
    expect(() => Sjms5ConfigSchema.parse({})).toThrow();
  });

  it("config schema applies defaults", () => {
    const cfg = Sjms5ConfigSchema.parse(baseConfig);
    expect(cfg.schema).toBe("public");
    expect(cfg.statementTimeoutMs).toBeGreaterThan(0);
  });
});

describe("Sjms5Adapter — healthCheck", () => {
  it("returns healthy when SELECT 1 succeeds", async () => {
    const mock = makeMockClient([{ sqlMatch: /SELECT 1/, rows: [{ "?column?": 1 }] }]);
    const factory: PgClientFactory = async () => mock;
    const adapter = new Sjms5Adapter(baseConfig, { clientFactory: factory });
    const result = await adapter.healthCheck(makeCtx());
    expect(result.healthy).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns unhealthy on query failure", async () => {
    const factory: PgClientFactory = async () => ({
      connect: async () => undefined,
      query: async () => {
        throw new Error("connection refused");
      },
      end: async () => undefined,
    });
    const adapter = new Sjms5Adapter(baseConfig, { clientFactory: factory });
    const result = await adapter.healthCheck(makeCtx());
    expect(result.healthy).toBe(false);
    expect(result.message).toMatch(/connection refused/);
  });
});

describe("Sjms5Adapter — discoverSchema", () => {
  it("returns one resource descriptor per supported resource", async () => {
    const colsRows = [
      { column_name: "id", data_type: "integer", is_nullable: "NO" },
      { column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "YES" },
    ];
    const mock = makeMockClient(
      SUPPORTED_RESOURCES.map(() => ({
        sqlMatch: /information_schema\.columns/,
        rows: colsRows,
      }))
    );
    const factory: PgClientFactory = async () => mock;
    const adapter = new Sjms5Adapter(baseConfig, { clientFactory: factory });
    const schema = await adapter.discoverSchema(makeCtx());
    expect(schema.adapter).toBe("sjms5");
    expect(schema.resources.map((r) => r.name).sort()).toEqual([...SUPPORTED_RESOURCES].sort());
    expect(schema.resources[0]?.fields.find((f) => f.name === "id")?.isKey).toBe(true);
  });
});

describe("Sjms5Adapter — sampleTable", () => {
  it("returns mapped rows for a supported resource", async () => {
    const mock = makeMockClient([
      {
        sqlMatch: /FROM "public"\."students"/,
        rows: [
          { id: 1, given_names: "Alice", family_name: "S", date_of_birth: null },
          { id: 2, given_names: "Bob", family_name: "T", date_of_birth: null },
        ],
      },
    ]);
    const factory: PgClientFactory = async () => mock;
    const adapter = new Sjms5Adapter(baseConfig, { clientFactory: factory });
    const rows = await adapter.sampleTable(makeCtx(), { resource: "Student", limit: 2 });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.["given_names"]).toBe("Alice");
  });

  it("rejects unsupported resources", async () => {
    const adapter = new Sjms5Adapter(baseConfig, {
      clientFactory: async () => {
        throw new Error("should not connect");
      },
    });
    await expect(
      adapter.sampleTable(makeCtx(), { resource: "DOES_NOT_EXIST", limit: 5 })
    ).rejects.toThrow(/not supported/);
  });
});

describe("Sjms5Adapter — streamRows", () => {
  it("paginates with keyset cursor until exhausted", async () => {
    // COUNT(*) then two pages then a third empty page check by adapter
    const mock = makeMockClient([
      { sqlMatch: /COUNT\(\*\)/, rows: [{ c: "3" }] },
      {
        sqlMatch: /FROM "public"\."students"/,
        rows: [
          { id: 1, given_names: "A" },
          { id: 2, given_names: "B" },
        ],
      },
      {
        sqlMatch: /FROM "public"\."students"/,
        rows: [{ id: 3, given_names: "C" }],
      },
    ]);
    const factory: PgClientFactory = async () => mock;
    const adapter = new Sjms5Adapter(baseConfig, { clientFactory: factory });
    const pages = [];
    for await (const page of adapter.streamRows(makeCtx(), {
      resource: "Student",
      pageSize: 2,
    })) {
      pages.push(page);
    }
    expect(pages.length).toBe(2);
    expect(pages[0]?.rows.length).toBe(2);
    expect(pages[0]?.nextCursor).toBe("2");
    expect(pages[1]?.rows.length).toBe(1);
    expect(pages[0]?.totalRows).toBe(3);
  });

  it("filters by sinceTimestamp when supplied", async () => {
    const mock = makeMockClient([
      { sqlMatch: /COUNT\(\*\)/, rows: [{ c: "0" }] },
      { sqlMatch: /updated_at.*>=/, rows: [] },
    ]);
    const factory: PgClientFactory = async () => mock;
    const adapter = new Sjms5Adapter(baseConfig, { clientFactory: factory });
    const pages = [];
    for await (const page of adapter.streamRows(makeCtx(), {
      resource: "Student",
      sinceTimestamp: "2026-01-01T00:00:00Z",
    })) {
      pages.push(page);
    }
    expect(pages.length).toBe(1);
    expect(mock.calls.some((c) => /updated_at/.test(c.sql))).toBe(true);
  });
});

describe("Sjms5Adapter — getRecordById", () => {
  it("returns the row when found", async () => {
    const mock = makeMockClient([
      {
        sqlMatch: /WHERE "id" = \$1/,
        rows: [{ id: 42, given_names: "Eve" }],
      },
    ]);
    const factory: PgClientFactory = async () => mock;
    const adapter = new Sjms5Adapter(baseConfig, { clientFactory: factory });
    const row = await adapter.getRecordById(makeCtx(), {
      resource: "Student",
      id: "42",
    });
    expect(row?.["given_names"]).toBe("Eve");
  });

  it("returns null when not found", async () => {
    const mock = makeMockClient([{ sqlMatch: /WHERE "id" = \$1/, rows: [] }]);
    const factory: PgClientFactory = async () => mock;
    const adapter = new Sjms5Adapter(baseConfig, { clientFactory: factory });
    const row = await adapter.getRecordById(makeCtx(), {
      resource: "Student",
      id: "999",
    });
    expect(row).toBeNull();
  });
});
