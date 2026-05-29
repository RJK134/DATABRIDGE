/**
 * PgAuditStore tests.
 *
 * Drives the store with a fake PoolLike that records SQL + params and
 * replays canned result rows. We don't exercise the real pg client here
 * (that's covered indirectly by adapter-sjms5/pg-client patterns); the
 * goal of these tests is to pin the SQL shape and roundtrip semantics
 * of the AuditStoreLike contract.
 */
import { describe, expect, it, beforeEach } from "vitest";

import { PgAuditStore, AUDIT_TABLE_DDL } from "../pg-audit-store.js";
import type { PgPoolLike } from "../pg-audit-store.js";

interface Call {
  sql: string;
  params: ReadonlyArray<unknown> | undefined;
}

interface FakeRow {
  audit_id: string;
  tenant_id: string;
  profile_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  report: string | null;
  error: string | null;
}

class FakePool implements PgPoolLike {
  public calls: Call[] = [];
  public rowsToReturn: FakeRow[] = [];
  public rowCountToReturn = 1;

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>
  ): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params });
    return {
      rows: this.rowsToReturn as unknown as T[],
      rowCount: this.rowCountToReturn,
    };
  }
}

describe("PgAuditStore", () => {
  let pool: FakePool;
  let store: PgAuditStore;

  beforeEach(() => {
    pool = new FakePool();
    store = new PgAuditStore({ pool });
  });

  it("ensureSchema runs the table DDL idempotently", async () => {
    await store.ensureSchema();
    await store.ensureSchema();
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0]?.sql).toBe(AUDIT_TABLE_DDL);
  });

  it("create() inserts a row and returns the AuditRecord shape", async () => {
    const rec = await store.create({
      auditId: "a1",
      tenantId: "t1",
      profileId: "sits",
      status: "running",
    });
    // First call = ensureSchema DDL, second = INSERT
    expect(pool.calls).toHaveLength(2);
    const insert = pool.calls[1];
    expect(insert?.sql).toMatch(/^INSERT INTO audits/);
    expect(insert?.params?.[0]).toBe("a1");
    expect(insert?.params?.[1]).toBe("t1");
    expect(insert?.params?.[3]).toBe("running");
    expect(rec.auditId).toBe("a1");
    expect(rec.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("update() builds dynamic SET and returns 404 when nothing matched", async () => {
    await store.ensureSchema();
    pool.rowCountToReturn = 0;
    const result = await store.update("missing", { status: "failed" });
    expect(result).toBeUndefined();
    const update = pool.calls[1];
    expect(update?.sql).toMatch(/UPDATE audits SET/);
    expect(update?.sql).toMatch(/status = \$2/);
  });

  it("update() serialises the report JSON and merges with existing row on success", async () => {
    await store.ensureSchema();
    pool.rowCountToReturn = 1;
    // get() after update — return one row
    pool.rowsToReturn = [
      {
        audit_id: "a2",
        tenant_id: "t1",
        profile_id: "sits",
        status: "succeeded",
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:05.000Z",
        report: JSON.stringify({
          auditId: "a2",
          tenantId: "t1",
          startedAt: "x",
          completedAt: "y",
          rulesTotal: 0,
          rulesSql: 0,
          rulesFn: 0,
          rowsScanned: 0,
          findingsTotal: 0,
          findingsBySeverity: {},
          findings: [],
          warnings: [],
        }),
        error: null,
      },
    ];

    const updated = await store.update("a2", {
      status: "succeeded",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      report: { auditId: "a2" } as any,
    });
    expect(updated?.status).toBe("succeeded");
    expect(updated?.report?.auditId).toBe("a2");

    const updateCall = pool.calls[1];
    // Report should be JSON-stringified into params.
    expect(updateCall?.params).toContainEqual(JSON.stringify({ auditId: "a2" }));
  });

  it("get() returns undefined when the row is missing", async () => {
    await store.ensureSchema();
    pool.rowsToReturn = [];
    expect(await store.get("nope")).toBeUndefined();
  });

  it("get() parses string JSONB back into a report object", async () => {
    await store.ensureSchema();
    pool.rowsToReturn = [
      {
        audit_id: "a3",
        tenant_id: "t1",
        profile_id: "sits",
        status: "succeeded",
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
        report: '{"auditId":"a3","findingsTotal":2}',
        error: null,
      },
    ];
    const rec = await store.get("a3");
    expect(rec?.report).toEqual({ auditId: "a3", findingsTotal: 2 });
  });

  it("list() filters by tenantId when provided", async () => {
    await store.ensureSchema();
    pool.rowsToReturn = [];
    await store.list({ tenantId: "t1" });
    const sql = pool.calls[1]?.sql ?? "";
    expect(sql).toMatch(/WHERE tenant_id = \$1/);
    expect(pool.calls[1]?.params).toEqual(["t1"]);
  });

  it("list() omits the WHERE clause when no filter is provided", async () => {
    await store.ensureSchema();
    pool.rowsToReturn = [];
    await store.list();
    const sql = pool.calls[1]?.sql ?? "";
    expect(sql).not.toMatch(/WHERE/);
  });

  it("clear() truncates the audits table", async () => {
    await store.clear();
    const truncate = pool.calls.find((c) => /TRUNCATE/.test(c.sql));
    expect(truncate).toBeDefined();
  });
});
