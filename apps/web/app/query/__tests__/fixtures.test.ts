import { describe, it, expect } from "vitest";
import { DEMO_FIXTURES, PROMPT_LIBRARY } from "../fixtures";

describe("query bar fixtures", () => {
  it("ships one sample dataset per Phase A demo fixture", () => {
    const ids = Object.keys(DEMO_FIXTURES);
    expect(ids).toContain("banner-r2t-2024");
    expect(ids).toContain("sits-southcoast-2024");
    expect(ids).toContain("salesforce-edu-westmidlands");
    expect(ids).toContain("dynamics365-edu-northpennines");
    expect(ids).toHaveLength(4);
  });

  it("each fixture has 3-10 sample rows", () => {
    for (const [id, fix] of Object.entries(DEMO_FIXTURES)) {
      expect(fix.rows.length, id).toBeGreaterThanOrEqual(3);
      expect(fix.rows.length, id).toBeLessThanOrEqual(10);
    }
  });

  it("ships exactly five demo prompts", () => {
    expect(PROMPT_LIBRARY).toHaveLength(5);
  });

  it("every prompt label fits the small button cap (≤ 60 chars)", () => {
    for (const p of PROMPT_LIBRARY) {
      expect(p.label.length, p.label).toBeLessThanOrEqual(60);
    }
  });

  it("every prompt declares an expected rule with a `where` clause", () => {
    for (const p of PROMPT_LIBRARY) {
      expect(p.expectedRule).toHaveProperty("entity");
      expect(p.expectedRule).toHaveProperty("where");
      expect(p.expectedRule).toHaveProperty("severity");
    }
  });

  it("salesforce shared-email prompt finds 2 of 5 contacts", () => {
    const fix = DEMO_FIXTURES["salesforce-edu-westmidlands"];
    const shared = fix.rows.filter(
      (r) => r["Email"] === "shared.contact@uni.example",
    );
    expect(shared).toHaveLength(2);
  });

  it("sits HUSID prompt finds 1 of 5 students", () => {
    const fix = DEMO_FIXTURES["sits-southcoast-2024"];
    const missing = fix.rows.filter((r) => r["STU_HUSID"] === null);
    expect(missing).toHaveLength(1);
  });

  it("banner legacy-major prompt finds 2 of 5 students", () => {
    const fix = DEMO_FIXTURES["banner-r2t-2024"];
    const legacy = fix.rows.filter((r) => r["SGBSTDN_MAJR_CODE_1"] === "XX_LEGACY");
    expect(legacy).toHaveLength(2);
  });
});
