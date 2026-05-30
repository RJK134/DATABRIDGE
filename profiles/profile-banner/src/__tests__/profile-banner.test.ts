import { describe, it, expect } from "vitest";
import {
  BANNER_ENTITIES,
  BANNER_FIELD_CATALOGUE,
  BANNER_PROGRAMME_REGISTRATION_MAP,
  bannerEntityToCanonical,
  canonicalToBannerEntity,
} from "../index.js";

describe("BANNER_ENTITIES", () => {
  it("includes the SPRIDEN/STVMAJR/STVCAMP/SHRTGPA minimum surface", () => {
    expect(BANNER_ENTITIES.Spriden.bannerTables).toContain("SPRIDEN");
    expect(BANNER_ENTITIES.StvMajr.bannerTables).toContain("STVMAJR");
    expect(BANNER_ENTITIES.StvCamp.bannerTables).toContain("STVCAMP");
    expect(BANNER_ENTITIES.Shrtgpa.bannerTables).toContain("SHRTGPA");
  });

  it("orders prerequisites before dependents", () => {
    const spriden = BANNER_ENTITIES.Spriden.migrationOrder;
    const sgbstdn = BANNER_ENTITIES.Sgbstdn.migrationOrder;
    const shrtgpa = BANNER_ENTITIES.Shrtgpa.migrationOrder;
    expect(spriden).toBeLessThan(sgbstdn);
    expect(sgbstdn).toBeLessThan(shrtgpa);
  });
});

describe("BANNER_FIELD_CATALOGUE", () => {
  it("declares PIDM, SPRIDEN_ID, and SGBSTDN required-field anchors", () => {
    const fields = new Set(BANNER_FIELD_CATALOGUE.map((f) => f.bannerColumn));
    expect(fields.has("SPRIDEN_PIDM")).toBe(true);
    expect(fields.has("SPRIDEN_ID")).toBe(true);
    expect(fields.has("SGBSTDN_TERM_CODE_EFF")).toBe(true);
  });

  it("has SITS counterparts for the identity surface", () => {
    const pidm = BANNER_FIELD_CATALOGUE.find((f) => f.bannerColumn === "SPRIDEN_PIDM");
    expect(pidm?.sitsColumn).toBe("STU_INTID");
  });
});

describe("BANNER_PROGRAMME_REGISTRATION_MAP", () => {
  it("maps SGBSTDN_MAJR_CODE_1 to canonical programmeCode", () => {
    expect(bannerEntityToCanonical("SGBSTDN", "SGBSTDN_MAJR_CODE_1")).toBe("programmeCode");
  });

  it("maps personId back to the SPRIDEN entity", () => {
    expect(canonicalToBannerEntity("personId")).toBe("Spriden");
  });

  it("returns undefined for unknown canonical fields", () => {
    expect(canonicalToBannerEntity("nonexistent")).toBeUndefined();
  });

  it("declares a CASE rule for programmeCode covering the SORLFOS fallback", () => {
    const programme = BANNER_PROGRAMME_REGISTRATION_MAP.find(
      (m) => m.canonicalField === "programmeCode"
    );
    expect(programme?.caseRule).toMatch(/SORLFOS_MAJR_CODE/);
  });

  it("flags codeset-mapped fields for residency/programme/term/campus", () => {
    for (const f of ["programmeCode", "termCode", "campusCode", "studentType", "feeStatus"]) {
      const m = BANNER_PROGRAMME_REGISTRATION_MAP.find((e) => e.canonicalField === f);
      expect(m?.needsCodesetMap).toBe(true);
    }
  });
});
