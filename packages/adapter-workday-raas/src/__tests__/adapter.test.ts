import { describe, it, expect, vi } from "vitest";
import { WorkdayRaasAdapter, SUPPORTED_RESOURCES } from "../adapter.js";
import { WorkdayRaasConfigSchema } from "../config.js";

/**
 * Context with a secrets accessor that throws — drives the adapter
 * into the hermetic stub path. The SecretsAdapter contract is
 * `get(): Promise<string>` and throws when the key is not in the
 * vault, so this matches reality.
 */
function makeCtx() {
  return {
    tenantId: "test-tenant",
    connectionId: "test-conn",
    secrets: {
      get: vi.fn(async (): Promise<string> => {
        throw new Error("secret not found");
      }),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    signal: new AbortController().signal,
  };
}

describe("WorkdayRaasAdapter", () => {
  it("declares the correct identity and capabilities", () => {
    const adapter = new WorkdayRaasAdapter({
        tenantUrl: "https://wd5-impl-services1.workday.com/ccx/service/example/customreport2",
        username: "isu_databridge",
        passwordSecretKey: "wd-isu-pass"
    });
    expect(adapter.id).toBe("workday-raas");
    expect(adapter.displayName).toBe("Workday RaaS (Reports)");
    expect(adapter.capabilities.supportsSampling).toBe(true);
    expect(adapter.capabilities.preferredAuth).toBeDefined();
  });

  it("config schema rejects an empty object", () => {
    expect(() => WorkdayRaasConfigSchema.parse({})).toThrow();
  });

  it("healthCheck returns a stub healthy result", async () => {
    const adapter = new WorkdayRaasAdapter({
        tenantUrl: "https://wd5-impl-services1.workday.com/ccx/service/example/customreport2",
        username: "isu_databridge",
        passwordSecretKey: "wd-isu-pass"
    });
    const result = await adapter.healthCheck(makeCtx());
    expect(result.healthy).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("discoverSchema includes all supported resources", async () => {
    const adapter = new WorkdayRaasAdapter({
        tenantUrl: "https://wd5-impl-services1.workday.com/ccx/service/example/customreport2",
        username: "isu_databridge",
        passwordSecretKey: "wd-isu-pass"
    });
    const schema = await adapter.discoverSchema(makeCtx());
    expect(schema.adapter).toBe("workday-raas");
    expect(schema.resources.map((r) => r.name).sort()).toEqual(
      [...SUPPORTED_RESOURCES].sort(),
    );
  });

  it("rejects unsupported resources in sampleTable", async () => {
    const adapter = new WorkdayRaasAdapter({
        tenantUrl: "https://wd5-impl-services1.workday.com/ccx/service/example/customreport2",
        username: "isu_databridge",
        passwordSecretKey: "wd-isu-pass"
    });
    await expect(
      adapter.sampleTable(makeCtx(), { resource: "DOES_NOT_EXIST", limit: 5 }),
    ).rejects.toThrow(/not supported/);
  });

  it("streamRows yields at least one page for a supported resource", async () => {
    const adapter = new WorkdayRaasAdapter({
        tenantUrl: "https://wd5-impl-services1.workday.com/ccx/service/example/customreport2",
        username: "isu_databridge",
        passwordSecretKey: "wd-isu-pass"
    });
    const pages: unknown[] = [];
    for await (const page of adapter.streamRows(makeCtx(), { resource: SUPPORTED_RESOURCES[0] })) {
      pages.push(page);
    }
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });
});
