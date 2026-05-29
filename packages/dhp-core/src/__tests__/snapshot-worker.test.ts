import { describe, it, expect, vi } from "vitest";
import { DhpSnapshotWorker } from "../snapshot-worker";
import type { SnapshotStore } from "../snapshot-worker";
import type { DhpComputeInput, DhpSnapshot } from "../types";

const makeStore = (previous: DhpSnapshot | null = null): SnapshotStore => ({
  save: vi.fn().mockResolvedValue(undefined),
  getLatest: vi.fn().mockResolvedValue(previous),
});

const input: DhpComputeInput = {
  tenantId: "tenant-abc",
  profileId: "hesa-tdp",
  records: { Student: new Array(20).fill({}) },
  ruleResults: [],
};

describe("DhpSnapshotWorker", () => {
  it("saves a snapshot and returns it", async () => {
    const store = makeStore();
    const worker = new DhpSnapshotWorker(store);
    const snap = await worker.run(input);
    expect(snap.tenantId).toBe("tenant-abc");
    expect(snap.id).toBeTruthy();
    expect(store.save).toHaveBeenCalledWith(snap);
  });

  it("snapshot has no delta when no previous snapshot exists", async () => {
    const store = makeStore(null);
    const worker = new DhpSnapshotWorker(store);
    const snap = await worker.run(input);
    expect(snap.delta).toBeUndefined();
  });

  it("computes delta when a previous snapshot exists", async () => {
    const previous: DhpSnapshot = {
      id: "prev-id",
      tenantId: "tenant-abc",
      profileId: "hesa-tdp",
      snapshotAt: new Date(),
      metrics: {
        tenantId: "tenant-abc",
        profileId: "hesa-tdp",
        computedAt: new Date(),
        entities: [
          { entity: "Student", totalRecords: 20, dimensions: {} as any, overallScore: 0.8 },
        ],
        overallScore: 0.8,
      },
    };
    const store = makeStore(previous);
    const worker = new DhpSnapshotWorker(store);
    const snap = await worker.run(input);
    expect(snap.delta).toBeDefined();
    expect(snap.delta!.previousSnapshotId).toBe("prev-id");
    // Perfect input = overallScore 1.0, delta = +0.2
    expect(snap.delta!.overallScoreDelta).toBeGreaterThan(0);
  });
});
