/**
 * createAuditStore() tests.
 *
 * Cases:
 *  - DATABASE_URL unset → InMemoryAuditStore.
 *  - DATABASE_URL set but pg unavailable → graceful fallback to InMemoryAuditStore.
 *
 * We don't test the happy path against a real Postgres in this file; that's
 * covered by integration tests run with a live DATABASE_URL in CI.
 */
import { describe, expect, it } from "vitest";

import { createAuditStore } from "../audit-store-factory.js";
import { InMemoryAuditStore } from "../audit-store.js";

describe("createAuditStore", () => {
  it("returns an InMemoryAuditStore when no DATABASE_URL is configured", async () => {
    const logs: object[] = [];
    // Save and clear env var to force the in-memory branch.
    const prev = process.env["DATABASE_URL"];
    delete process.env["DATABASE_URL"];
    const store = await createAuditStore({
      logger: { info: (o: object) => logs.push(o) },
    });
    if (prev !== undefined) process.env["DATABASE_URL"] = prev;
    expect(store).toBeInstanceOf(InMemoryAuditStore);
    expect(JSON.stringify(logs)).toMatch(/in-memory store/);
  });

  it("falls back to InMemoryAuditStore when Pg init fails", async () => {
    // Point at a URL whose host won't resolve so DDL fails fast.
    const logs: object[] = [];
    const store = await createAuditStore({
      databaseUrl: "postgres://nobody@databridge-audit-store-nonexistent.invalid:5432/x",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: {
        info: (o: object) => logs.push(o),
        warn: (o: object) => logs.push(o),
      } as any,
    });
    expect(store).toBeInstanceOf(InMemoryAuditStore);
  }, 15_000);
});
