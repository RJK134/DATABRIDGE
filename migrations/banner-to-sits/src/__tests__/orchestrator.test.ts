import { describe, it, expect, vi } from "vitest";
import type {
  SourceAdapter,
  AdapterContext,
  StreamRowsArgs,
  StreamRowsPage,
} from "@databridge/adapter-spec";
import { BannerToSitsOrchestrator } from "../orchestrator.js";
import { BannerToSitsConfigSchema } from "../config.js";
import { createDefaultRegistry } from "@databridge/codeset-mapper";

function fakeBannerAdapter(
  rowsByResource: Record<string, Array<Record<string, unknown>>>
): SourceAdapter {
  return {
    id: "banner-oracle",
    displayName: "Fake Banner",
    capabilities: {
      supportsIncremental: false,
      supportsDictionary: false,
      supportsSampling: true,
      supportsCodeLists: false,
      preferredAuth: "db-credentials",
    },
    async healthCheck() {
      return { healthy: true, latencyMs: 1 };
    },
    async discoverSchema() {
      return { adapter: "banner-oracle", generatedAt: new Date().toISOString(), resources: [] };
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

describe("BannerToSitsConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    const cfg = BannerToSitsConfigSchema.parse({
      source: "banner-oracle",
      collectionYear: "2024/25",
    });
    expect(cfg.dryRun).toBe(true);
    expect(cfg.batchSize).toBe(500);
  });

  it("rejects an invalid collection year format", () => {
    expect(() =>
      BannerToSitsConfigSchema.parse({
        source: "banner-oracle",
        collectionYear: "24-25",
      })
    ).toThrow();
  });

  it("accepts banner-ethos as a source option", () => {
    const cfg = BannerToSitsConfigSchema.parse({
      source: "banner-ethos",
      collectionYear: "2024/25",
    });
    expect(cfg.source).toBe("banner-ethos");
  });
});

describe("BannerToSitsOrchestrator", () => {
  it("rejects a non-Banner source adapter", () => {
    const ad: SourceAdapter = {
      ...fakeBannerAdapter({}),
      id: "sits-api",
    };
    expect(
      () => new BannerToSitsOrchestrator({ source: "banner-oracle", collectionYear: "2024/25" }, ad)
    ).toThrow(/Banner source adapter/);
  });

  it("runs all supported entities in dry-run mode by default", async () => {
    const orchestrator = new BannerToSitsOrchestrator(
      { source: "banner-oracle", collectionYear: "2024/25" },
      fakeBannerAdapter({
        SPRIDEN: [
          { SPRIDEN_PIDM: 1, SPRIDEN_ID: "A1", SPRIDEN_LAST_NAME: "X", SPRIDEN_FIRST_NAME: "Y" },
        ],
        STVMAJR: [{ STVMAJR_CODE: "CS", STVMAJR_DESC: "Computer Science" }],
        SGBSTDN: [{ SGBSTDN_PIDM: 1, SGBSTDN_TERM_CODE_EFF: "202410" }],
        SHRTGPA: [{ SHRTGPA_PIDM: 1, SHRTGPA_TERM_CODE: "202410", SHRTGPA_GPA: 3.2 }],
        SFRSTCR: [{ SFRSTCR_PIDM: 1, SFRSTCR_TERM_CODE: "202410", SFRSTCR_CRN: "12345" }],
        SHRDGMR: [{ SHRDGMR_PIDM: 1 }],
      })
    );
    const result = await orchestrator.run(makeCtx());
    expect(result.totalRowsRead).toBe(6);
    expect(result.totalRowsValid).toBe(6);
    expect(result.totalRowsInvalid).toBe(0);
    expect(result.outcomes).toHaveLength(6);
    expect(result.dryRun).toBe(true);
  });

  it("flags rows missing the SPRIDEN_PIDM identity anchor as invalid", async () => {
    const orchestrator = new BannerToSitsOrchestrator(
      {
        source: "banner-oracle",
        collectionYear: "2024/25",
        entities: ["Student"],
      },
      fakeBannerAdapter({
        SPRIDEN: [
          { SPRIDEN_PIDM: 1, SPRIDEN_ID: "A1" },
          { SPRIDEN_ID: "A2" }, // missing PIDM
        ],
      })
    );
    const result = await orchestrator.run(makeCtx());
    const student = result.outcomes.find((o) => o.entity === "Student");
    expect(student?.rowsValid).toBe(1);
    expect(student?.rowsInvalid).toBe(1);
    expect(student?.errors[0]?.ruleId).toBe("BANNER-MIG-01");
  });

  it("emits a SITS-shaped load plan when dryRun=false", async () => {
    const orchestrator = new BannerToSitsOrchestrator(
      {
        source: "banner-oracle",
        collectionYear: "2024/25",
        dryRun: false,
        entities: ["Student"],
      },
      fakeBannerAdapter({
        SPRIDEN: [
          { SPRIDEN_PIDM: 1, SPRIDEN_ID: "A1", SPRIDEN_LAST_NAME: "X", SPRIDEN_FIRST_NAME: "Y" },
          { SPRIDEN_PIDM: 2, SPRIDEN_ID: "A2", SPRIDEN_LAST_NAME: "Z", SPRIDEN_FIRST_NAME: "W" },
        ],
      })
    );
    const result = await orchestrator.run(makeCtx());
    expect(result.loadPlan).toHaveLength(1);
    expect(result.loadPlan[0]?.table).toBe("STU");
    expect(result.loadPlan[0]?.rows).toBe(2);
  });

  it("translates Banner campus codes to SITS via codeset registry", async () => {
    const reg = createDefaultRegistry();
    const orchestrator = new BannerToSitsOrchestrator(
      {
        source: "banner-oracle",
        collectionYear: "2024/25",
        dryRun: false,
        entities: ["Enrolment"],
      },
      fakeBannerAdapter({
        SGBSTDN: [{ SGBSTDN_PIDM: 1, SGBSTDN_TERM_CODE_EFF: "202410", SGBSTDN_CAMP_CODE: "MAIN" }],
      }),
      reg
    );
    const result = await orchestrator.run(makeCtx());
    expect(result.outcomes[0]?.rowsStaged).toBe(1);
  });
});
