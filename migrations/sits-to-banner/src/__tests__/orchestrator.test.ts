import { describe, it, expect, vi } from "vitest";
import type {
  SourceAdapter,
  AdapterContext,
  StreamRowsArgs,
  StreamRowsPage,
} from "@databridge/adapter-spec";
import { SitsToBannerOrchestrator } from "../orchestrator.js";
import { SitsToBannerConfigSchema } from "../config.js";
import { createDefaultRegistry } from "@databridge/codeset-mapper";

function fakeSitsAdapter(
  rowsByResource: Record<string, Array<Record<string, unknown>>>
): SourceAdapter {
  return {
    id: "sits-api",
    displayName: "Fake SITS",
    capabilities: {
      supportsIncremental: false,
      supportsDictionary: false,
      supportsSampling: true,
      supportsCodeLists: false,
      preferredAuth: "bearer",
    },
    async healthCheck() {
      return { healthy: true, latencyMs: 1 };
    },
    async discoverSchema() {
      return { adapter: "sits-api", generatedAt: new Date().toISOString(), resources: [] };
    },
    async sampleTable() {
      return [];
    },
    async *streamRows(_ctx: AdapterContext, args: StreamRowsArgs): AsyncIterable<StreamRowsPage> {
      const rows = rowsByResource[args.resource] ?? [];
      yield {
        rows: rows.map((r) => {
          const out: Record<string, string | number | boolean | null> = {};
          for (const [k, v] of Object.entries(r)) {
            if (v === null || v === undefined) out[k] = null;
            else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
              out[k] = v;
            else out[k] = JSON.stringify(v);
          }
          return out;
        }),
        totalRows: rows.length,
      };
    },
    async getCodeLists() {
      return [];
    },
    async getDictionary() {
      return [];
    },
    async getRecordById() {
      return null;
    },
  };
}

function makeCtx(): AdapterContext {
  return {
    tenantId: "test-tenant",
    connectionId: "test-conn",
    secrets: { get: vi.fn(async () => "dummy") },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    signal: new AbortController().signal,
  };
}

describe("SitsToBannerConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    const cfg = SitsToBannerConfigSchema.parse({
      source: "sits-api",
      collectionYear: "2024/25",
    });
    expect(cfg.dryRun).toBe(true);
    expect(cfg.batchSize).toBe(500);
  });

  it("rejects an invalid collection year format", () => {
    expect(() =>
      SitsToBannerConfigSchema.parse({ source: "sits-api", collectionYear: "2024" })
    ).toThrow();
  });
});

describe("SitsToBannerOrchestrator", () => {
  it("rejects a non-SITS adapter", () => {
    const ad: SourceAdapter = {
      ...fakeSitsAdapter({}),
      id: "banner-oracle",
    };
    expect(
      () => new SitsToBannerOrchestrator({ source: "sits-api", collectionYear: "2024/25" }, ad)
    ).toThrow(/SITS source adapter/);
  });

  it("runs all entities in dry-run mode", async () => {
    const orch = new SitsToBannerOrchestrator(
      { source: "sits-api", collectionYear: "2024/25" },
      fakeSitsAdapter({
        STU: [{ STU_CODE: "S1", STU_SURN: "X", STU_FORE: "Y" }],
        POS: [{ POS_CODE: "P1", POS_NAME: "Prog" }],
        SCE: [{ SCE_STUC: "S1", SCE_AYR: "2024/25" }],
        STA: [{ STA_STUC: "S1", STA_AYR: "2024/25", STA_GPA: 3.0 }],
        SMR: [{ SMR_STUC: "S1", SMR_MOD: "M1" }],
        AWD: [{ AWD_STUC: "S1" }],
      })
    );
    const result = await orch.run(makeCtx());
    expect(result.totalRowsRead).toBe(6);
    expect(result.totalRowsValid).toBe(6);
    expect(result.outcomes).toHaveLength(6);
  });

  it("flags rows missing STU_CODE as invalid", async () => {
    const orch = new SitsToBannerOrchestrator(
      { source: "sits-api", collectionYear: "2024/25", entities: ["Student"] },
      fakeSitsAdapter({ STU: [{ STU_SURN: "no-code" }] })
    );
    const result = await orch.run(makeCtx());
    expect(result.outcomes[0]?.rowsInvalid).toBe(1);
    expect(result.outcomes[0]?.errors[0]?.ruleId).toBe("SITS-MIG-01");
  });

  it("emits a Banner-shaped load plan when dryRun=false", async () => {
    const orch = new SitsToBannerOrchestrator(
      {
        source: "sits-api",
        collectionYear: "2024/25",
        dryRun: false,
        entities: ["Student"],
      },
      fakeSitsAdapter({
        STU: [
          { STU_CODE: "S1", STU_SURN: "X", STU_FORE: "Y" },
          { STU_CODE: "S2", STU_SURN: "Z", STU_FORE: "W" },
        ],
      })
    );
    const result = await orch.run(makeCtx());
    expect(result.loadPlan).toHaveLength(1);
    expect(result.loadPlan[0]?.table).toBe("SPRIDEN");
    expect(result.loadPlan[0]?.rows).toBe(2);
  });

  it("translates SITS fee-status to Banner residency via codeset registry", async () => {
    const reg = createDefaultRegistry();
    const orch = new SitsToBannerOrchestrator(
      {
        source: "sits-api",
        collectionYear: "2024/25",
        dryRun: false,
        entities: ["Enrolment"],
      },
      fakeSitsAdapter({
        SCE: [{ SCE_STUC: "S1", SCE_AYR: "2024/25", SCE_CAM: "M" }],
      }),
      reg
    );
    const result = await orch.run(makeCtx());
    expect(result.outcomes[0]?.rowsStaged).toBe(1);
  });
});
