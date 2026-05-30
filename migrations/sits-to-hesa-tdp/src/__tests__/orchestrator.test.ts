import { describe, it, expect, vi } from "vitest";
import type {
  SourceAdapter,
  AdapterContext,
  StreamRowsArgs,
  StreamRowsPage,
} from "@databridge/adapter-spec";
import { SitsToHesaTdpOrchestrator } from "../orchestrator.js";
import { SitsToHesaTdpConfigSchema } from "../config.js";

function fakeAdapter(id: string, rowsPerCall: number): SourceAdapter {
  return {
    id,
    displayName: `Fake ${id}`,
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
      return { adapter: id, generatedAt: new Date().toISOString(), resources: [] };
    },
    async sampleTable() {
      return [];
    },
    async *streamRows(_ctx: AdapterContext, _args: StreamRowsArgs): AsyncIterable<StreamRowsPage> {
      yield {
        rows: Array.from({ length: rowsPerCall }, (_, i) => ({ id: `r${i}` })),
        totalRows: rowsPerCall,
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

describe("SitsToHesaTdpConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    const cfg = SitsToHesaTdpConfigSchema.parse({
      source: "sits-api",
      collectionYear: "2024/25",
    });
    expect(cfg.batchSize).toBe(500);
    expect(cfg.dryRun).toBe(true);
  });

  it("rejects an invalid collection year format", () => {
    expect(() =>
      SitsToHesaTdpConfigSchema.parse({ source: "sits-api", collectionYear: "2024" })
    ).toThrow();
  });
});

describe("SitsToHesaTdpOrchestrator", () => {
  it("rejects a non-SITS source adapter", () => {
    expect(
      () =>
        new SitsToHesaTdpOrchestrator(
          { source: "sits-api", collectionYear: "2024/25" },
          fakeAdapter("banner-oracle", 0)
        )
    ).toThrow(/SITS source adapter/);
  });

  it("runs all supported entities in dry-run mode by default", async () => {
    const orchestrator = new SitsToHesaTdpOrchestrator(
      { source: "sits-api", collectionYear: "2024/25" },
      fakeAdapter("sits-api", 3)
    );
    const result = await orchestrator.run(makeCtx());
    expect(result.dryRun).toBe(true);
    expect(result.outcomes.length).toBe(SitsToHesaTdpOrchestrator.SUPPORTED_ENTITIES.length);
    expect(result.totalRowsRead).toBe(3 * SitsToHesaTdpOrchestrator.SUPPORTED_ENTITIES.length);
    expect(result.totalRowsInvalid).toBe(0);
  });

  it("respects the entities filter when provided", async () => {
    const orchestrator = new SitsToHesaTdpOrchestrator(
      {
        source: "sits-api",
        collectionYear: "2024/25",
        entities: ["Student"],
      },
      fakeAdapter("sits-api", 2)
    );
    const result = await orchestrator.run(makeCtx());
    expect(result.outcomes.length).toBe(1);
    expect(result.outcomes[0]!.entity).toBe("Student");
    expect(result.totalRowsRead).toBe(2);
  });
});
