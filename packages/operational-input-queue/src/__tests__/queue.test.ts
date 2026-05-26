import { describe, it, expect } from "vitest";
import { OperationalInputQueue } from "../index.js";

describe("OperationalInputQueue", () => {
  it("enqueues an item with status=open and a fresh id", () => {
    const q = new OperationalInputQueue(() => "2026-01-01T00:00:00Z");
    const item = q.enqueue({
      entity: "scj",
      field: "scj_hiqp",
      reason: "no source equivalent",
      sourceId: "row-1",
    });
    expect(item.id).toBe("oiq-1");
    expect(item.status).toBe("open");
    expect(item.entity).toBe("scj");
    expect(item.sourceId).toBe("row-1");
    expect(item.createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("resolve sets value, resolvedBy, and status", () => {
    const q = new OperationalInputQueue();
    const item = q.enqueue({ entity: "scj", field: "scj_hiqp", reason: "gap" });
    const resolved = q.resolve({ id: item.id, value: "Y", resolvedBy: "registry-clerk" });
    expect(resolved.status).toBe("resolved");
    expect(resolved.value).toBe("Y");
    expect(resolved.resolvedBy).toBe("registry-clerk");
  });

  it("rejects double-resolve", () => {
    const q = new OperationalInputQueue();
    const item = q.enqueue({ entity: "scj", field: "scj_hiqp", reason: "gap" });
    q.resolve({ id: item.id, value: "Y", resolvedBy: "u" });
    expect(() => q.resolve({ id: item.id, value: "N", resolvedBy: "u" })).toThrow(
      /not open/,
    );
  });

  it("skip marks an item without a value", () => {
    const q = new OperationalInputQueue();
    const item = q.enqueue({ entity: "scj", field: "scj_hiqp", reason: "gap" });
    const skipped = q.skip({ id: item.id, resolvedBy: "u", note: "irrelevant for this cohort" });
    expect(skipped.status).toBe("skipped");
    expect(skipped.reason).toContain("irrelevant");
  });

  it("list filters by status + entity", () => {
    const q = new OperationalInputQueue();
    q.enqueue({ entity: "scj", field: "f1", reason: "" });
    q.enqueue({ entity: "scj", field: "f2", reason: "" });
    const e = q.enqueue({ entity: "mab", field: "f3", reason: "" });
    q.resolve({ id: e.id, value: "x", resolvedBy: "u" });
    expect(q.list({ status: "open" }).length).toBe(2);
    expect(q.list({ entity: "mab" }).length).toBe(1);
    expect(q.list({ status: "resolved", entity: "mab" }).length).toBe(1);
  });

  it("stats counts each status accurately", () => {
    const q = new OperationalInputQueue();
    const a = q.enqueue({ entity: "x", field: "f", reason: "" });
    q.enqueue({ entity: "x", field: "f", reason: "" });
    const c = q.enqueue({ entity: "x", field: "f", reason: "" });
    q.resolve({ id: a.id, value: "1", resolvedBy: "u" });
    q.skip({ id: c.id, resolvedBy: "u" });
    expect(q.stats()).toEqual({ open: 1, resolved: 1, skipped: 1, total: 3 });
  });

  it("snapshot round-trip preserves items and seq", () => {
    const q = new OperationalInputQueue();
    q.enqueue({ entity: "x", field: "f", reason: "" });
    q.enqueue({ entity: "x", field: "f", reason: "" });
    const snap = q.toJSON();
    const q2 = new OperationalInputQueue();
    q2.loadSnapshot(snap);
    const fresh = q2.enqueue({ entity: "x", field: "g", reason: "" });
    expect(fresh.id).toBe("oiq-3");
    expect(q2.list().length).toBe(3);
  });

  it("throws for unknown id on resolve/skip", () => {
    const q = new OperationalInputQueue();
    expect(() => q.resolve({ id: "nope", value: "", resolvedBy: "u" })).toThrow(
      /no such item/,
    );
    expect(() => q.skip({ id: "nope", resolvedBy: "u" })).toThrow(/no such item/);
  });
});
