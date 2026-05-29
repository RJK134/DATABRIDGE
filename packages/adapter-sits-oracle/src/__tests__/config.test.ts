import { describe, it, expect } from "vitest";
import { SitsOracleConfigSchema } from "../config";

describe("SitsOracleConfigSchema", () => {
  it("parses valid config with defaults applied", () => {
    const config = SitsOracleConfigSchema.parse({
      connectString: "db.sits.ac.uk:1521/SITSDB",
      user: "sits_reader",
      password: "s3cr3t",
    });
    expect(config.poolMax).toBe(4);
    expect(config.poolMin).toBe(1);
    expect(config.queryTimeoutMs).toBe(30_000);
    expect(config.schemaPrefix).toBe("");
  });

  it("accepts custom pool and timeout values", () => {
    const config = SitsOracleConfigSchema.parse({
      connectString: "db:1521/SITS",
      user: "u",
      password: "p",
      poolMax: 10,
      queryTimeoutMs: 60_000,
    });
    expect(config.poolMax).toBe(10);
    expect(config.queryTimeoutMs).toBe(60_000);
  });

  it("rejects missing connectString", () => {
    expect(() => SitsOracleConfigSchema.parse({ user: "u", password: "p" })).toThrow();
  });

  it("rejects poolMax above 20", () => {
    expect(() =>
      SitsOracleConfigSchema.parse({
        connectString: "db:1521/SITS",
        user: "u",
        password: "p",
        poolMax: 25,
      })
    ).toThrow();
  });
});
