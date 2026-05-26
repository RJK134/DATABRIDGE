import { describe, it, expect } from "vitest";
import {
  parseMigrationPolicy,
  parsePartialPolicy,
  buildDefaultPolicy,
  POLICY_DEFAULTS,
  type MigrationPolicy,
} from "../index.js";

const FULL_BUNDLE: MigrationPolicy = {
  id: "test@1.0.0",
  description: "test bundle",
  tenantId: "tenant-a",
  sourceSystem: "banner",
  targetSystem: "sits",
  crnGenerator: { strategy: "monotonic", start: 50000, width: 5 },
  scjAttempt: { strategy: "monotonic", startAt: 1 },
  multiCurriculum: { strategy: "preserve-all" },
  componentMark: { strategy: "preserve-in-canonical", projectOnWrite: true },
  creditHour: { catsPerCreditHour: 3.75, rounding: "nearest" },
  gradeScheme: { mapId: "m@1", onMissing: "warn" },
  termToAcademicYear: { strategy: "stvterm-driven" },
  feeStatus: { mapId: "f@1", defaultToUnknown: true },
  classificationGap: { strategy: "queue-for-registry" },
  intercalation: { strategy: "status-transition", pauseStatuses: ["IT"] },
};

describe("parseMigrationPolicy (strict)", () => {
  it("parses a complete object bundle", () => {
    const result = parseMigrationPolicy(FULL_BUNDLE);
    expect(result.id).toBe("test@1.0.0");
    expect(result.crnGenerator.strategy).toBe("monotonic");
  });

  it("parses a JSON string bundle", () => {
    const json = JSON.stringify(FULL_BUNDLE);
    const result = parseMigrationPolicy(json);
    expect(result.sourceSystem).toBe("banner");
  });

  it("throws on malformed JSON", () => {
    expect(() => parseMigrationPolicy("{not-json")).toThrow(/not valid JSON/);
  });

  it("throws when a required slot is missing", () => {
    const { crnGenerator: _omit, ...rest } = FULL_BUNDLE;
    expect(() => parseMigrationPolicy(rest)).toThrow(/crnGenerator/);
  });

  it("rejects an unknown source system", () => {
    const bad = { ...FULL_BUNDLE, sourceSystem: "magic" };
    expect(() => parseMigrationPolicy(bad)).toThrow(/sourceSystem/);
  });
});

describe("parsePartialPolicy (defaults merge)", () => {
  it("fills missing slots with POLICY_DEFAULTS", () => {
    const result = parsePartialPolicy({
      id: "partial@1",
      sourceSystem: "sits",
      targetSystem: "banner",
    });
    expect(result.crnGenerator).toEqual(POLICY_DEFAULTS.crnGenerator);
    expect(result.scjAttempt).toEqual(POLICY_DEFAULTS.scjAttempt);
    expect(result.intercalation).toEqual(POLICY_DEFAULTS.intercalation);
  });

  it("preserves explicit overrides while filling the rest", () => {
    const result = parsePartialPolicy({
      id: "partial@2",
      sourceSystem: "banner",
      targetSystem: "sits",
      crnGenerator: { strategy: "hash", bucketSize: 5000 },
      classificationGap: { strategy: "default-band", band: "22" },
    });
    expect(result.crnGenerator).toEqual({ strategy: "hash", bucketSize: 5000 });
    expect(result.classificationGap).toEqual({ strategy: "default-band", band: "22" });
    // Untouched slots fall back to defaults
    expect(result.componentMark).toEqual(POLICY_DEFAULTS.componentMark);
  });

  it("throws when required headers are missing", () => {
    expect(() => parsePartialPolicy({ id: "x" })).toThrow(/sourceSystem|targetSystem/);
  });

  it("rejects non-object input", () => {
    expect(() => parsePartialPolicy(42)).toThrow(/must be an object/);
  });
});

describe("buildDefaultPolicy", () => {
  it("returns a fully populated policy", () => {
    const policy = buildDefaultPolicy({
      id: "default-build@1",
      sourceSystem: "banner",
      targetSystem: "sits",
    });
    expect(policy.gradeScheme.mapId).toBe(POLICY_DEFAULTS.gradeScheme.mapId);
    expect(policy.intercalation.strategy).toBe("status-transition");
  });

  it("optional description + tenantId carry through when provided", () => {
    const policy = buildDefaultPolicy({
      id: "default-build@2",
      sourceSystem: "sits",
      targetSystem: "banner",
      description: "demo",
      tenantId: "tenant-b",
    });
    expect(policy.description).toBe("demo");
    expect(policy.tenantId).toBe("tenant-b");
  });
});

describe("example bundles", () => {
  it("banner-to-sits example parses cleanly", async () => {
    const mod = await import("../../examples/banner-to-sits-default.json", {
      with: { type: "json" },
    });
    const parsed = parseMigrationPolicy(mod.default);
    expect(parsed.sourceSystem).toBe("banner");
    expect(parsed.targetSystem).toBe("sits");
  });

  it("sits-to-banner example parses cleanly", async () => {
    const mod = await import("../../examples/sits-to-banner-default.json", {
      with: { type: "json" },
    });
    const parsed = parseMigrationPolicy(mod.default);
    expect(parsed.crnGenerator.strategy).toBe("hash");
  });
});
