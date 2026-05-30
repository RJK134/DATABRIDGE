import { describe, it, expect, vi } from "vitest";
import { SitsFileAdapter, SUPPORTED_RESOURCES } from "../adapter.js";
import { SitsFileConfigSchema } from "../config.js";

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

describe("SitsFileAdapter", () => {
  it("declares the correct identity and capabilities", () => {
    const adapter = new SitsFileAdapter({
      rootPath: "/mnt/sits-exports",
    });
    expect(adapter.id).toBe("sits-file");
    expect(adapter.displayName).toBe("SITS file extracts (CSV/XML)");
    expect(adapter.capabilities.supportsSampling).toBe(true);
    expect(adapter.capabilities.preferredAuth).toBeDefined();
  });

  it("config schema rejects an empty object", () => {
    expect(() => SitsFileConfigSchema.parse({})).toThrow();
  });

  it("healthCheck returns a stub healthy result", async () => {
    const adapter = new SitsFileAdapter({
      rootPath: "/mnt/sits-exports",
    });
    const result = await adapter.healthCheck(makeCtx());
    expect(result.healthy).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("discoverSchema includes all supported resources", async () => {
    const adapter = new SitsFileAdapter({
      rootPath: "/mnt/sits-exports",
    });
    const schema = await adapter.discoverSchema(makeCtx());
    expect(schema.adapter).toBe("sits-file");
    expect(schema.resources.map((r) => r.name).sort()).toEqual([...SUPPORTED_RESOURCES].sort());
  });

  it("rejects unsupported resources in sampleTable", async () => {
    const adapter = new SitsFileAdapter({
      rootPath: "/mnt/sits-exports",
    });
    await expect(
      adapter.sampleTable(makeCtx(), { resource: "DOES_NOT_EXIST", limit: 5 })
    ).rejects.toThrow(/not supported/);
  });

  it("streamRows yields at least one page for a supported resource", async () => {
    const adapter = new SitsFileAdapter({
      rootPath: "/mnt/sits-exports",
    });
    const pages: unknown[] = [];
    for await (const page of adapter.streamRows(makeCtx(), { resource: SUPPORTED_RESOURCES[0] })) {
      pages.push(page);
    }
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });
});
