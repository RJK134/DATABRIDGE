import { describe, it, expect, vi } from "vitest";
import { SitsApiAdapter, SUPPORTED_RESOURCES } from "../adapter.js";
import { SitsApiConfigSchema } from "../config.js";

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

describe("SitsApiAdapter", () => {
  it("declares the correct identity and capabilities", () => {
    const adapter = new SitsApiAdapter({
      baseUrl: "https://sits.example.ac.uk/urd/run/SIW_WSV",
      bearerSecretKey: "sits-api-token",
    });
    expect(adapter.id).toBe("sits-api");
    expect(adapter.displayName).toBe("SITS Web Services (REST)");
    expect(adapter.capabilities.supportsSampling).toBe(true);
    expect(adapter.capabilities.preferredAuth).toBeDefined();
  });

  it("config schema rejects an empty object", () => {
    expect(() => SitsApiConfigSchema.parse({})).toThrow();
  });

  it("healthCheck returns a stub healthy result", async () => {
    const adapter = new SitsApiAdapter({
      baseUrl: "https://sits.example.ac.uk/urd/run/SIW_WSV",
      bearerSecretKey: "sits-api-token",
    });
    const result = await adapter.healthCheck(makeCtx());
    expect(result.healthy).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("discoverSchema includes all supported resources", async () => {
    const adapter = new SitsApiAdapter({
      baseUrl: "https://sits.example.ac.uk/urd/run/SIW_WSV",
      bearerSecretKey: "sits-api-token",
    });
    const schema = await adapter.discoverSchema(makeCtx());
    expect(schema.adapter).toBe("sits-api");
    expect(schema.resources.map((r) => r.name).sort()).toEqual([...SUPPORTED_RESOURCES].sort());
  });

  it("rejects unsupported resources in sampleTable", async () => {
    const adapter = new SitsApiAdapter({
      baseUrl: "https://sits.example.ac.uk/urd/run/SIW_WSV",
      bearerSecretKey: "sits-api-token",
    });
    await expect(
      adapter.sampleTable(makeCtx(), { resource: "DOES_NOT_EXIST", limit: 5 })
    ).rejects.toThrow(/not supported/);
  });

  it("streamRows yields at least one page for a supported resource", async () => {
    const adapter = new SitsApiAdapter({
      baseUrl: "https://sits.example.ac.uk/urd/run/SIW_WSV",
      bearerSecretKey: "sits-api-token",
    });
    const pages: unknown[] = [];
    for await (const page of adapter.streamRows(makeCtx(), { resource: SUPPORTED_RESOURCES[0] })) {
      pages.push(page);
    }
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });
});
