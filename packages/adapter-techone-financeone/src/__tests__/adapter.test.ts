import { describe, it, expect, vi } from "vitest";
import { TechOneFinanceOneAdapter, SUPPORTED_RESOURCES } from "../adapter.js";
import { TechOneFinanceOneConfigSchema } from "../config.js";

const VALID_CONFIG = {
  tenantUrl: "https://customer.techoneglobal.com",
  clientId: "databridge-client",
  clientSecretKey: "t1-connect-secret",
};

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

describe("TechOneFinanceOneAdapter", () => {
  it("declares the correct identity and capabilities", () => {
    const adapter = new TechOneFinanceOneAdapter(VALID_CONFIG);
    expect(adapter.id).toBe("techone-financeone");
    expect(adapter.displayName).toBe("Technology One — Finance One");
    expect(adapter.capabilities.supportsSampling).toBe(true);
    expect(adapter.capabilities.supportsIncremental).toBe(true);
    expect(adapter.capabilities.preferredAuth).toBe("oauth2");
  });

  it("config schema rejects an empty object", () => {
    expect(() => TechOneFinanceOneConfigSchema.parse({})).toThrow();
  });

  it("config schema applies sensible defaults", () => {
    const parsed = TechOneFinanceOneConfigSchema.parse(VALID_CONFIG);
    expect(parsed.ledgerEntity).toBe("01");
    expect(parsed.sisStudentNumberUdf).toBe("StudentID");
    expect(parsed.pageSize).toBe(500);
    expect(parsed.enableCiaFallback).toBe(false);
  });

  it("config schema rejects pageSize > 1000 (Connect API limit)", () => {
    expect(() =>
      TechOneFinanceOneConfigSchema.parse({ ...VALID_CONFIG, pageSize: 2000 }),
    ).toThrow();
  });

  it("healthCheck returns a stub healthy result with diagnostic details", async () => {
    const adapter = new TechOneFinanceOneAdapter(VALID_CONFIG);
    const result = await adapter.healthCheck(makeCtx());
    expect(result.healthy).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
    expect(result.details).toMatchObject({
      resources: SUPPORTED_RESOURCES.length,
      ledgerEntity: "01",
      ciaFallback: false,
    });
  });

  it("discoverSchema lists every supported resource", async () => {
    const adapter = new TechOneFinanceOneAdapter(VALID_CONFIG);
    const schema = await adapter.discoverSchema(makeCtx());
    expect(schema.adapter).toBe("techone-financeone");
    expect(schema.resources.map((r) => r.name).sort()).toEqual(
      [...SUPPORTED_RESOURCES].sort(),
    );
  });

  it("discoverSchema field set is non-trivial for the financial resources", async () => {
    const adapter = new TechOneFinanceOneAdapter(VALID_CONFIG);
    const schema = await adapter.discoverSchema(makeCtx());
    const invoices = schema.resources.find((r) => r.name === "Invoices");
    expect(invoices).toBeDefined();
    const fieldNames = invoices?.fields.map((f) => f.name) ?? [];
    expect(fieldNames).toContain("TransactionId");
    expect(fieldNames).toContain("Amount");
    expect(fieldNames).toContain("CurrencyCode");
    expect(fieldNames).toContain("SourceReference");
  });

  it("rejects unsupported resources in sampleTable", async () => {
    const adapter = new TechOneFinanceOneAdapter(VALID_CONFIG);
    await expect(
      adapter.sampleTable(makeCtx(), { resource: "DOES_NOT_EXIST", limit: 5 }),
    ).rejects.toThrow(/not supported/);
  });

  it("rejects unsupported resources in streamRows", async () => {
    const adapter = new TechOneFinanceOneAdapter(VALID_CONFIG);
    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _page of adapter.streamRows(makeCtx(), { resource: "NOPE" })) {
        // unreachable
      }
    }).rejects.toThrow(/not supported/);
  });

  it("streamRows yields at least one page for a supported resource", async () => {
    const adapter = new TechOneFinanceOneAdapter(VALID_CONFIG);
    const pages: unknown[] = [];
    for await (const page of adapter.streamRows(makeCtx(), { resource: SUPPORTED_RESOURCES[0] })) {
      pages.push(page);
    }
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });

  it("getRecordById returns null for the stub but validates the resource", async () => {
    const adapter = new TechOneFinanceOneAdapter(VALID_CONFIG);
    const result = await adapter.getRecordById(makeCtx(), {
      resource: "Customers",
      id: "S12345",
    });
    expect(result).toBeNull();
    await expect(
      adapter.getRecordById(makeCtx(), { resource: "NOPE", id: "x" }),
    ).rejects.toThrow(/not supported/);
  });

  it("getCodeLists and getDictionary return empty arrays in the stub", async () => {
    const adapter = new TechOneFinanceOneAdapter(VALID_CONFIG);
    await expect(adapter.getCodeLists(makeCtx())).resolves.toEqual([]);
    await expect(adapter.getDictionary(makeCtx())).resolves.toEqual([]);
  });
});
