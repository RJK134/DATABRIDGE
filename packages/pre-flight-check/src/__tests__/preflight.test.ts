import { describe, it, expect } from "vitest";
import { InMemoryTransport, type TargetTransport } from "@databridge/target-adapters";
import {
  runPreFlightCheck,
  summarisePreFlight,
  BUNDLED_REQUIREMENTS,
} from "../index.js";
import type { SampledRow } from "@databridge/adapter-spec";

describe("runPreFlightCheck", () => {
  it("passes when all bundled requirements are declared on the transport", async () => {
    const t = new InMemoryTransport();
    t.declareField("SHRDGMR", "INST_HONOR");
    const report = await runPreFlightCheck({
      transport: t,
      requirements: "banner-uk-classification",
    });
    expect(report.passed).toBe(true);
    expect(report.missing).toBe(0);
    expect(report.checks[0]!.verdict).toBe("ok");
  });

  it("flags missing fields", async () => {
    const t = new InMemoryTransport();
    // do NOT declare SHRDGMR.INST_HONOR
    const report = await runPreFlightCheck({
      transport: t,
      requirements: "banner-uk-classification",
    });
    expect(report.passed).toBe(false);
    expect(report.missing).toBe(1);
    expect(report.checks[0]!.verdict).toBe("missing");
    expect(report.checks[0]!.reason).toContain("SHRDGMR.INST_HONOR");
  });

  it("returns 'unknown' verdict for transports lacking hasField", async () => {
    const minimalTransport: TargetTransport = {
      async write(_e: string, _r: SampledRow) {
        return "id";
      },
      async remove() {
        /* noop */
      },
    };
    const report = await runPreFlightCheck({
      transport: minimalTransport,
      requirements: "banner-uk-classification",
    });
    expect(report.passed).toBe(false);
    expect(report.unknown).toBe(1);
    expect(report.checks[0]!.verdict).toBe("unknown");
  });

  it("accepts a custom requirement list", async () => {
    const t = new InMemoryTransport();
    t.declareField("X", "Y");
    const report = await runPreFlightCheck({
      transport: t,
      requirements: [{ table: "X", field: "Y", gates: "demo" }],
    });
    expect(report.passed).toBe(true);
  });

  it("throws on an unknown bundle id", async () => {
    const t = new InMemoryTransport();
    await expect(
      runPreFlightCheck({ transport: t, requirements: "no-such-bundle" }),
    ).rejects.toThrow(/unknown requirement bundle/);
  });

  it("captures hasField exceptions as unknown", async () => {
    const t: TargetTransport = {
      async write(_e: string, _r: SampledRow) {
        return "id";
      },
      async remove() {
        /* noop */
      },
      async hasField() {
        throw new Error("connection refused");
      },
    };
    const report = await runPreFlightCheck({
      transport: t,
      requirements: "banner-fee-status",
    });
    expect(report.unknown).toBe(1);
    expect(report.checks[0]!.reason).toContain("connection refused");
  });

  it("bundles cover the named gating concerns", () => {
    expect(BUNDLED_REQUIREMENTS["banner-uk-classification"]).toBeDefined();
    expect(BUNDLED_REQUIREMENTS["banner-fee-status"]).toBeDefined();
    expect(BUNDLED_REQUIREMENTS["sits-fee-status"]).toBeDefined();
    expect(BUNDLED_REQUIREMENTS["banner-component-mark"]).toBeDefined();
  });
});

describe("summarisePreFlight", () => {
  it("formats pass and fail differently", async () => {
    const t = new InMemoryTransport();
    t.declareField("SHRDGMR", "INST_HONOR");
    const ok = await runPreFlightCheck({
      transport: t,
      requirements: "banner-uk-classification",
    });
    expect(summarisePreFlight(ok)).toMatch(/PASS/);
    const empty = new InMemoryTransport();
    const bad = await runPreFlightCheck({
      transport: empty,
      requirements: "banner-uk-classification",
    });
    expect(summarisePreFlight(bad)).toMatch(/FAIL/);
  });
});
