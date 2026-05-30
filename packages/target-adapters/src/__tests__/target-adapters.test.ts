import { describe, expect, it } from "vitest";
import { BannerTargetAdapter, InMemoryTransport, SitsTargetAdapter } from "../index.js";
import { makeTestContext } from "./test-context.js";

describe("SitsTargetAdapter — validate", () => {
  it("flags missing required fields per entity", async () => {
    const adapter = new SitsTargetAdapter(new InMemoryTransport());
    const result = await adapter.validate(makeTestContext(), {
      entity: "stu",
      rows: [
        { stu_code: "S1", stu_surn: "Smith", stu_fnm1: "Alice" },
        { stu_code: "S2", stu_surn: "", stu_fnm1: "Bob" },
        { stu_code: "", stu_surn: "Jones", stu_fnm1: "Carla" },
      ],
    });
    expect(result.valid).toBe(1);
    expect(result.invalid).toBe(2);
    expect(result.errors.map((e) => e.field).sort()).toEqual(["stu_code", "stu_surn"]);
  });

  it("accepts unknown entities with no required fields", async () => {
    const adapter = new SitsTargetAdapter(new InMemoryTransport());
    const result = await adapter.validate(makeTestContext(), {
      entity: "unknown_entity",
      rows: [{ foo: "bar" }],
    });
    expect(result.valid).toBe(1);
    expect(result.invalid).toBe(0);
  });
});

describe("SitsTargetAdapter — stage / commit dry-run", () => {
  it("dry-run never writes to transport and returns skipped outcomes", async () => {
    const transport = new InMemoryTransport();
    const adapter = new SitsTargetAdapter(transport);
    const ctx = makeTestContext();

    const stage = await adapter.stage(ctx, {
      migrationRunId: "run-1",
      entity: "stu",
      rows: [{ stu_code: "S1", stu_surn: "X", stu_fnm1: "Y" }],
      dryRun: true,
    });
    expect(stage.stagedCount).toBe(1);

    const commit = await adapter.commit(ctx, {
      batchId: stage.batchId,
      approvedBy: "tester",
      approvedAt: new Date("2026-05-26T15:00:00Z"),
    });
    expect(commit.committed).toBe(0);
    expect(commit.outcomes).toHaveLength(1);
    expect(commit.outcomes[0]?.status).toBe("skipped");
    expect(transport.store.get("stu")).toBeUndefined();
  });
});

describe("SitsTargetAdapter — full commit + rollback", () => {
  it("commits live writes through transport, then rolls them back", async () => {
    const transport = new InMemoryTransport();
    const adapter = new SitsTargetAdapter(transport);
    const ctx = makeTestContext();

    const stage = await adapter.stage(ctx, {
      migrationRunId: "run-2",
      entity: "stu",
      rows: [
        { stu_code: "S1", stu_surn: "Smith", stu_fnm1: "Alice" },
        { stu_code: "S2", stu_surn: "Jones", stu_fnm1: "Bob" },
      ],
      dryRun: false,
    });

    const commit = await adapter.commit(ctx, {
      batchId: stage.batchId,
      approvedBy: "tester",
      approvedAt: new Date(),
    });
    expect(commit.committed).toBe(2);
    expect(commit.failed).toBe(0);
    expect(transport.store.get("stu")?.size).toBe(2);

    await adapter.rollback(ctx, { batchId: stage.batchId, reason: "test rollback" });
    expect(transport.store.get("stu")?.size).toBe(0);
  });

  it("rejects re-commit of the same batch", async () => {
    const transport = new InMemoryTransport();
    const adapter = new SitsTargetAdapter(transport);
    const ctx = makeTestContext();
    const stage = await adapter.stage(ctx, {
      migrationRunId: "run-3",
      entity: "stu",
      rows: [{ stu_code: "S1", stu_surn: "S", stu_fnm1: "A" }],
      dryRun: false,
    });
    await adapter.commit(ctx, { batchId: stage.batchId, approvedBy: "t", approvedAt: new Date() });
    await expect(
      adapter.commit(ctx, { batchId: stage.batchId, approvedBy: "t", approvedAt: new Date() })
    ).rejects.toThrow(/already committed/);
  });

  it("rejects batches above the adapter size limit", async () => {
    const transport = new InMemoryTransport();
    const adapter = new SitsTargetAdapter(transport);
    const ctx = makeTestContext();
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      stu_code: `S${i}`,
      stu_surn: "X",
      stu_fnm1: "Y",
    }));
    await expect(
      adapter.stage(ctx, { migrationRunId: "rN", entity: "stu", rows, dryRun: true })
    ).rejects.toThrow(/batch size/);
  });
});

describe("BannerTargetAdapter", () => {
  it("validates spriden required fields", async () => {
    const adapter = new BannerTargetAdapter(new InMemoryTransport());
    const result = await adapter.validate(makeTestContext(), {
      entity: "spriden",
      rows: [
        { spriden_pidm: 1, spriden_id: "B1", spriden_last_name: "X", spriden_first_name: "Y" },
        { spriden_pidm: 2, spriden_id: "B2", spriden_last_name: null, spriden_first_name: "Z" },
      ],
    });
    expect(result.valid).toBe(1);
    expect(result.invalid).toBe(1);
    expect(result.errors[0]?.field).toBe("spriden_last_name");
  });

  it("dry-run commit yields zero writes and skipped outcomes", async () => {
    const transport = new InMemoryTransport();
    const adapter = new BannerTargetAdapter(transport);
    const ctx = makeTestContext();
    const stage = await adapter.stage(ctx, {
      migrationRunId: "run-b",
      entity: "spriden",
      rows: [
        { spriden_pidm: 1, spriden_id: "B1", spriden_last_name: "X", spriden_first_name: "Y" },
      ],
      dryRun: true,
    });
    const commit = await adapter.commit(ctx, {
      batchId: stage.batchId,
      approvedBy: "tester",
      approvedAt: new Date(),
    });
    expect(commit.committed).toBe(0);
    expect(commit.outcomes[0]?.status).toBe("skipped");
    expect(transport.store.size).toBe(0);
  });

  it("reports capabilities including rollback support", () => {
    const adapter = new BannerTargetAdapter(new InMemoryTransport());
    expect(adapter.capabilities.supportsRollback).toBe(true);
    expect(adapter.capabilities.batchSizeLimit).toBe(500);
  });
});
