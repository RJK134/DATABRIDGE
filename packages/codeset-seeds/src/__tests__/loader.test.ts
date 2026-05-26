import { describe, it, expect } from "vitest";
import {
  loadCodesetSeed,
  loadCodesetSeedAsync,
  loadAllCodesetSeeds,
  listCodesetSeeds,
  SEED_BUNDLE_IDS,
} from "../loader.js";

const FIXED_STAMP = "2026-01-01T00:00:00.000Z";

describe("loadCodesetSeed", () => {
  it("loads the SITS seed with eight code lists", () => {
    const lists = loadCodesetSeed("sits", { snapshotAt: FIXED_STAMP });
    expect(lists.length).toBeGreaterThanOrEqual(8);
    expect(lists.every((l) => l.snapshotAt === FIXED_STAMP)).toBe(true);
    expect(lists.find((l) => l.id === "SITS.NAT")).toBeDefined();
    expect(lists.find((l) => l.id === "SITS.ETHN")).toBeDefined();
  });

  it("loads the Banner seed with nine STV* code lists", () => {
    const lists = loadCodesetSeed("banner", { snapshotAt: FIXED_STAMP });
    expect(lists.length).toBeGreaterThanOrEqual(9);
    expect(lists.find((l) => l.id === "BANNER.STVTERM")).toBeDefined();
    expect(lists.find((l) => l.id === "BANNER.STVRESD")).toBeDefined();
    expect(lists.find((l) => l.id === "BANNER.STVSTST")).toBeDefined();
  });

  it("loads the HESA seed with seven canonical code lists", () => {
    const lists = loadCodesetSeed("hesa", { snapshotAt: FIXED_STAMP });
    expect(lists.length).toBeGreaterThanOrEqual(7);
    expect(lists.find((l) => l.id === "HESA.SEXID")).toBeDefined();
    expect(lists.find((l) => l.id === "HESA.FEESTATUS")).toBeDefined();
    expect(lists.find((l) => l.id === "HESA.RSNEND")).toBeDefined();
    expect(lists.find((l) => l.id === "HESA.CLASSIFICATION")).toBeDefined();
  });

  it("rejects unknown bundle ids", () => {
    // @ts-expect-error — testing runtime guard with an invalid id
    expect(() => loadCodesetSeed("nope", { snapshotAt: FIXED_STAMP })).toThrow();
  });

  it("loadAllCodesetSeeds returns a Map keyed by CodeList.id", () => {
    const map = loadAllCodesetSeeds({ snapshotAt: FIXED_STAMP });
    expect(map.size).toBeGreaterThanOrEqual(24);
    expect(map.get("HESA.SEXID")?.entries.length).toBeGreaterThan(0);
    expect(map.get("SITS.NAT")?.source).toBe("sits");
  });

  it("listCodesetSeeds returns metadata summaries for every bundle", () => {
    const summaries = listCodesetSeeds();
    expect(summaries.map((s) => s.id).sort()).toEqual([...SEED_BUNDLE_IDS].sort());
    for (const s of summaries) {
      expect(s.codeListCount).toBeGreaterThan(0);
      expect(s.totalEntries).toBeGreaterThan(0);
      expect(s.version).toMatch(/^\d/);
    }
  });

  it("async loader returns the same shape as sync", async () => {
    const sync = loadCodesetSeed("hesa", { snapshotAt: FIXED_STAMP });
    const asyncL = await loadCodesetSeedAsync("hesa", { snapshotAt: FIXED_STAMP });
    expect(asyncL.map((l) => l.id).sort()).toEqual(sync.map((l) => l.id).sort());
  });

  it("HESA FEESTATUS bridges SITS and Banner fee-status attribute mappings", () => {
    const sits = loadCodesetSeed("sits", { snapshotAt: FIXED_STAMP });
    const banner = loadCodesetSeed("banner", { snapshotAt: FIXED_STAMP });
    const sitsFee = sits.find((l) => l.id === "SITS.FEEST")!;
    const bannerResd = banner.find((l) => l.id === "BANNER.STVRESD")!;
    const homeFromSits = sitsFee.entries.find((e) => e.code === "H");
    const homeFromBanner = bannerResd.entries.find((e) => e.code === "H");
    // Both should target HESA.FEESTATUS code "1" (Home)
    expect(homeFromSits?.attributes?.["hesa.feestatus"]).toBe("1");
    expect(homeFromBanner?.attributes?.["hesa.feestatus"]).toBe("1");
  });
});
