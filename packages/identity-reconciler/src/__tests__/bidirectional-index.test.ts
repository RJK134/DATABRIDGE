import { describe, expect, it } from "vitest";
import type { PersonRecord } from "../index.js";
import {
  buildBidirectionalIndex,
  bannerToSits,
  sitsToBanner,
  resolveCanonicalFromBanner,
  resolveCanonicalFromSits,
} from "../index.js";

const banner = (id: string, canonicalId?: string): PersonRecord => {
  const r: PersonRecord = {
    system: "banner",
    sourceId: id,
    firstName: "Alice",
    lastName: "Smith",
  };
  if (canonicalId !== undefined) r.canonicalId = canonicalId;
  return r;
};

const sits = (id: string, canonicalId?: string): PersonRecord => {
  const r: PersonRecord = {
    system: "sits",
    sourceId: id,
    firstName: "Alice",
    lastName: "Smith",
  };
  if (canonicalId !== undefined) r.canonicalId = canonicalId;
  return r;
};

describe("buildBidirectionalIndex", () => {
  it("groups paired Banner + SITS records under a shared canonicalId", () => {
    const records: PersonRecord[] = [banner("PIDM-1", "CAN-1"), sits("STU-1", "CAN-1")];
    const idx = buildBidirectionalIndex(records);
    expect(idx.byCanonical.size).toBe(1);
    expect(idx.byBanner.get("PIDM-1")?.sits).toBe("STU-1");
    expect(idx.bySits.get("STU-1")?.banner).toBe("PIDM-1");
  });

  it("supports forward (Banner → SITS) and reverse (SITS → Banner) lookups", () => {
    const records = [banner("PIDM-2", "CAN-2"), sits("STU-2", "CAN-2")];
    const idx = buildBidirectionalIndex(records);
    expect(bannerToSits(idx, "PIDM-2")).toBe("STU-2");
    expect(sitsToBanner(idx, "STU-2")).toBe("PIDM-2");
  });

  it("returns undefined for unknown source ids", () => {
    const idx = buildBidirectionalIndex([]);
    expect(bannerToSits(idx, "missing")).toBeUndefined();
    expect(sitsToBanner(idx, "missing")).toBeUndefined();
  });

  it("emits a synthetic canonical id when none is provided", () => {
    const records = [banner("PIDM-A"), sits("STU-A")];
    const idx = buildBidirectionalIndex(records);
    // Two records with no canonicalId → two synthetic anchors (no merge).
    expect(idx.byCanonical.size).toBe(2);
    expect(resolveCanonicalFromBanner(idx, "PIDM-A")).toMatch(/^synthetic:/);
    expect(resolveCanonicalFromSits(idx, "STU-A")).toMatch(/^synthetic:/);
  });

  it("attaches auxiliary systems to the others map without breaking Banner/SITS indexes", () => {
    const records: PersonRecord[] = [
      banner("PIDM-3", "CAN-3"),
      sits("STU-3", "CAN-3"),
      { system: "ucas", sourceId: "UCAS-3", canonicalId: "CAN-3" },
      { system: "workday", sourceId: "WD-3", canonicalId: "CAN-3" },
    ];
    const idx = buildBidirectionalIndex(records);
    const entry = idx.byCanonical.get("CAN-3");
    expect(entry?.banner).toBe("PIDM-3");
    expect(entry?.sits).toBe("STU-3");
    expect(entry?.others["ucas"]).toEqual(["UCAS-3"]);
    expect(entry?.others["workday"]).toEqual(["WD-3"]);
  });

  it("preserves the canonicalId roundtrip in both directions", () => {
    const records = [banner("PIDM-4", "CAN-4"), sits("STU-4", "CAN-4")];
    const idx = buildBidirectionalIndex(records);
    expect(resolveCanonicalFromBanner(idx, "PIDM-4")).toBe("CAN-4");
    expect(resolveCanonicalFromSits(idx, "STU-4")).toBe("CAN-4");
  });

  it("handles multiple altIds on the same canonical record", () => {
    const records: PersonRecord[] = [
      { ...banner("PIDM-5", "CAN-5"), husid: "1234567890123" },
      { ...sits("STU-5", "CAN-5"), husid: "1234567890123" },
    ];
    const idx = buildBidirectionalIndex(records);
    expect(idx.byCanonical.size).toBe(1);
    expect(idx.byBanner.get("PIDM-5")?.sits).toBe("STU-5");
  });
});
