import { describe, expect, it } from "vitest";
import {
  BUNDLED_MAP_FILES,
  CodesetMapRegistry,
  computeCoverage,
  createDefaultRegistry,
  loadAllBundledMaps,
  loadBundledMap,
  translateCode,
} from "../index.js";
import type { CodesetMap } from "../index.js";

describe("CodesetMapRegistry", () => {
  it("resolves the bundled default when no tenant override is registered", () => {
    const reg = createDefaultRegistry();
    const map = reg.resolve("STVRESD", "FEESTATUS");
    expect(map).toBeDefined();
    expect(map?.id).toBe("banner-stvresd-to-hesa-feestatus@1.0.0");
  });

  it("prefers a tenant-specific override when both are present", () => {
    const reg = createDefaultRegistry();
    const override: CodesetMap = {
      id: "tenant-acme-stvresd@1",
      name: "Acme STVRESD override",
      sourceCodelist: "STVRESD",
      targetCodelist: "FEESTATUS",
      version: "1.0.0",
      tenantId: "acme",
      entries: [{ sourceCode: "H", targetCode: "ACME-H" }],
    };
    reg.register(override);
    const resolved = reg.resolve("STVRESD", "FEESTATUS", "acme");
    expect(resolved?.id).toBe(override.id);
    expect(resolved?.entries[0]?.targetCode).toBe("ACME-H");

    // tenant unknown → falls back to bundled default
    const fallback = reg.resolve("STVRESD", "FEESTATUS", "other");
    expect(fallback?.id).toBe("banner-stvresd-to-hesa-feestatus@1.0.0");
  });

  it("get by id returns the registered map", () => {
    const reg = createDefaultRegistry();
    const map = reg.get("banner-stvgrde-to-numeric@1.0.0");
    expect(map?.targetCodelist).toBe("NUMERIC_GRADE");
  });
});

describe("translateCode", () => {
  const reg = createDefaultRegistry();

  it("translates STVRESD H → FEESTATUS 01", () => {
    const r = translateCode(reg, {
      sourceCodelist: "STVRESD",
      targetCodelist: "FEESTATUS",
      sourceCode: "H",
    });
    expect(r.ok).toBe(true);
    expect(r.targetCode).toBe("01");
    expect(r.notes).toContain("Home");
  });

  it("returns unmapped reason for unknown source code", () => {
    const r = translateCode(reg, {
      sourceCodelist: "STVRESD",
      targetCodelist: "FEESTATUS",
      sourceCode: "ZZ",
    });
    expect(r.ok).toBe(false);
    expect(r.unmappedReason).toContain("ZZ");
  });

  it("returns no-map error when no registry entry exists", () => {
    const r = translateCode(reg, {
      sourceCodelist: "UNKNOWN_A",
      targetCodelist: "UNKNOWN_B",
      sourceCode: "X",
    });
    expect(r.ok).toBe(false);
    expect(r.unmappedReason).toContain("no map");
  });

  it("translates HECOS → CIP2020 via the seed map", () => {
    const r = translateCode(reg, {
      sourceCodelist: "HECOS",
      targetCodelist: "CIP2020",
      sourceCode: "100100",
    });
    expect(r.ok).toBe(true);
    expect(r.targetCode).toBe("11.0701");
  });

  it("honours activeFrom/activeTo when `at` is supplied", () => {
    const reg2 = new CodesetMapRegistry();
    reg2.register({
      id: "test-windowed@1",
      name: "windowed",
      sourceCodelist: "S",
      targetCodelist: "T",
      version: "1.0.0",
      entries: [
        { sourceCode: "X", targetCode: "T1", activeFrom: "2020-01-01", activeTo: "2024-12-31" },
        { sourceCode: "X", targetCode: "T2", activeFrom: "2025-01-01" },
      ],
    });
    const a = translateCode(reg2, {
      sourceCodelist: "S",
      targetCodelist: "T",
      sourceCode: "X",
      at: "2023-06-01",
    });
    expect(a.targetCode).toBe("T1");
    const b = translateCode(reg2, {
      sourceCodelist: "S",
      targetCodelist: "T",
      sourceCode: "X",
      at: "2026-01-01",
    });
    expect(b.targetCode).toBe("T2");
  });
});

describe("computeCoverage", () => {
  it("reports full coverage when every observed code is mapped", () => {
    const map = loadBundledMap("stvresd-to-feestatus.json");
    const cov = computeCoverage(map, ["H", "E", "O", "U"]);
    expect(cov.coverage).toBe(1);
    expect(cov.observed).toBe(4);
    expect(cov.unmappedCodes).toEqual([]);
  });

  it("lists unmapped codes when present", () => {
    const map = loadBundledMap("stvresd-to-feestatus.json");
    const cov = computeCoverage(map, ["H", "ZZ", "QQ"]);
    expect(cov.observed).toBe(3);
    expect(cov.mapped).toBe(1);
    expect(cov.unmappedCodes.sort()).toEqual(["QQ", "ZZ"]);
    expect(cov.coverage).toBeCloseTo(1 / 3);
  });

  it("returns 1.0 coverage when nothing was observed", () => {
    const map = loadBundledMap("stvresd-to-feestatus.json");
    const cov = computeCoverage(map, []);
    expect(cov.coverage).toBe(1);
    expect(cov.observed).toBe(0);
  });
});

describe("bundled maps", () => {
  it("loads every advertised bundled map", () => {
    const maps = loadAllBundledMaps();
    expect(maps).toHaveLength(BUNDLED_MAP_FILES.length);
    for (const m of maps) {
      expect(m.id).toBeTruthy();
      expect(m.entries.length).toBeGreaterThan(0);
    }
  });

  it("includes all gap-analysis required maps", () => {
    const reg = createDefaultRegistry();
    expect(reg.resolve("STVRESD", "FEESTATUS")).toBeDefined();
    expect(reg.resolve("STVSTST", "RSNEND")).toBeDefined();
    expect(reg.resolve("STVGRDE", "NUMERIC_GRADE")).toBeDefined();
    expect(reg.resolve("ETHN_CODE", "ETHNIC")).toBeDefined();
    expect(reg.resolve("NATN_CODE", "ISO3166N")).toBeDefined();
    expect(reg.resolve("HECOS", "CIP2020")).toBeDefined();
    expect(reg.resolve("HECOS", "JACS3")).toBeDefined();
    expect(reg.resolve("CIP2020", "HECOS")).toBeDefined();
  });
});
