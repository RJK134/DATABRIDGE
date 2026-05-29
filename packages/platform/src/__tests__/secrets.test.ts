/**
 * Secrets adapter tests for EnvSecretsAdapter + MemorySecretsAdapter.
 */
import { describe, it, expect } from "vitest";
import { EnvSecretsAdapter, MemorySecretsAdapter } from "../adapters/secrets-impls.js";

describe("MemorySecretsAdapter", () => {
  it("get/set/list round-trip", async () => {
    const m = new MemorySecretsAdapter({ A: "1" });
    expect(await m.get("A")).toBe("1");
    await m.set("B", "2");
    expect((await m.list()).sort()).toEqual(["A", "B"]);
    expect(await m.get("B")).toBe("2");
  });

  it("throws on missing key", async () => {
    const m = new MemorySecretsAdapter();
    await expect(m.get("nope")).rejects.toThrow(/not found/);
  });

  it("clear() empties the store", async () => {
    const m = new MemorySecretsAdapter({ A: "1" });
    m.clear();
    expect(await m.list()).toEqual([]);
  });
});

describe("EnvSecretsAdapter", () => {
  it("reads bare key from env", async () => {
    const env = new EnvSecretsAdapter({ env: { DATABASE_URL: "postgres://x" } });
    expect(await env.get("DATABASE_URL")).toBe("postgres://x");
  });

  it("prefers prefixed key over bare key when prefix set", async () => {
    const env = new EnvSecretsAdapter({
      prefix: "DATABRIDGE_",
      env: {
        DATABRIDGE_DATABASE_URL: "postgres://prefixed",
        DATABASE_URL: "postgres://bare",
      },
    });
    expect(await env.get("DATABASE_URL")).toBe("postgres://prefixed");
  });

  it("falls back to bare key if prefixed is missing", async () => {
    const env = new EnvSecretsAdapter({
      prefix: "DATABRIDGE_",
      env: { DATABASE_URL: "postgres://bare" },
    });
    expect(await env.get("DATABASE_URL")).toBe("postgres://bare");
  });

  it("throws when key absent", async () => {
    const env = new EnvSecretsAdapter({ env: {} });
    await expect(env.get("MISSING")).rejects.toThrow(/not found/);
  });

  it("treats empty string as missing", async () => {
    const env = new EnvSecretsAdapter({ env: { EMPTY: "" } });
    await expect(env.get("EMPTY")).rejects.toThrow(/not found/);
  });

  it("enforces allowlist on get()", async () => {
    const env = new EnvSecretsAdapter({
      env: { ALLOWED: "yes", BLOCKED: "no" },
      allowlist: ["ALLOWED"],
    });
    expect(await env.get("ALLOWED")).toBe("yes");
    await expect(env.get("BLOCKED")).rejects.toThrow(/allowlist/);
  });

  it("list() returns allowlist when set", async () => {
    const env = new EnvSecretsAdapter({
      env: { ALLOWED: "yes", BLOCKED: "no" },
      allowlist: ["ALLOWED", "OTHER"],
    });
    expect(await env.list()).toEqual(["ALLOWED", "OTHER"]);
  });

  it("list() with prefix strips prefix from returned keys", async () => {
    const env = new EnvSecretsAdapter({
      prefix: "DATABRIDGE_",
      env: {
        DATABRIDGE_FOO: "1",
        DATABRIDGE_BAR: "2",
        UNRELATED: "3",
      },
    });
    expect(await env.list()).toEqual(["BAR", "FOO"]);
  });
});
