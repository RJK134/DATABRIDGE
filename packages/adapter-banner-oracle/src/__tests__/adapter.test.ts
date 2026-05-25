import { describe, it, expect, vi } from "vitest";
import { BannerOracleAdapter, SUPPORTED_RESOURCES } from "../adapter.js";
import { BannerOracleConfigSchema } from "../config.js";

function makeCtx() {
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

describe("BannerOracleAdapter", () => {
  it("declares the correct identity and capabilities", () => {
    const adapter = new BannerOracleAdapter({
        connectString: "banner.example.ac.uk:1521/BNRPRD",
        userSecretKey: "banner-user",
        passwordSecretKey: "banner-pass"
    });
    expect(adapter.id).toBe("banner-oracle");
    expect(adapter.displayName).toBe("Banner Oracle (native)");
    expect(adapter.capabilities.supportsSampling).toBe(true);
    expect(adapter.capabilities.preferredAuth).toBeDefined();
  });

  it("config schema rejects an empty object", () => {
    expect(() => BannerOracleConfigSchema.parse({})).toThrow();
  });

  it("healthCheck returns a stub healthy result", async () => {
    const adapter = new BannerOracleAdapter({
        connectString: "banner.example.ac.uk:1521/BNRPRD",
        userSecretKey: "banner-user",
        passwordSecretKey: "banner-pass"
    });
    const result = await adapter.healthCheck(makeCtx());
    expect(result.healthy).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("discoverSchema includes all supported resources", async () => {
    const adapter = new BannerOracleAdapter({
        connectString: "banner.example.ac.uk:1521/BNRPRD",
        userSecretKey: "banner-user",
        passwordSecretKey: "banner-pass"
    });
    const schema = await adapter.discoverSchema(makeCtx());
    expect(schema.adapter).toBe("banner-oracle");
    expect(schema.resources.map((r) => r.name).sort()).toEqual(
      [...SUPPORTED_RESOURCES].sort(),
    );
  });

  it("rejects unsupported resources in sampleTable", async () => {
    const adapter = new BannerOracleAdapter({
        connectString: "banner.example.ac.uk:1521/BNRPRD",
        userSecretKey: "banner-user",
        passwordSecretKey: "banner-pass"
    });
    await expect(
      adapter.sampleTable(makeCtx(), { resource: "DOES_NOT_EXIST", limit: 5 }),
    ).rejects.toThrow(/not supported/);
  });

  it("streamRows yields at least one page for a supported resource", async () => {
    const adapter = new BannerOracleAdapter({
        connectString: "banner.example.ac.uk:1521/BNRPRD",
        userSecretKey: "banner-user",
        passwordSecretKey: "banner-pass"
    });
    const pages: unknown[] = [];
    for await (const page of adapter.streamRows(makeCtx(), { resource: SUPPORTED_RESOURCES[0] })) {
      pages.push(page);
    }
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });
});
