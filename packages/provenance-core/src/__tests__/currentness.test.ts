import { describe, it, expect } from "vitest";
import { resolveCurrentness } from "../currentness.js";

describe("resolveCurrentness — activity-dated (Banner)", () => {
  it("marks row as current when activityDate == latestActivityDate", () => {
    const out = resolveCurrentness({
      pattern: "activity-dated",
      signals: { activityDate: "2024-06-01T00:00:00Z", latestActivityDate: "2024-06-01T00:00:00Z" },
    });
    expect(out?.isCurrent).toBe(true);
    expect(out?.currentFrom).toBe("2024-06-01T00:00:00Z");
  });

  it("marks row as not current when activityDate < latestActivityDate", () => {
    const out = resolveCurrentness({
      pattern: "activity-dated",
      signals: { activityDate: "2024-01-01T00:00:00Z", latestActivityDate: "2024-06-01T00:00:00Z" },
    });
    expect(out?.isCurrent).toBe(false);
  });

  it("returns undefined when no activityDate", () => {
    expect(resolveCurrentness({ pattern: "activity-dated", signals: {} })).toBeUndefined();
  });
});

describe("resolveCurrentness — term-keyed (Banner SGBSTDN)", () => {
  it("uses term start as currentFrom and marks current if no next term", () => {
    const out = resolveCurrentness({
      pattern: "term-keyed",
      signals: { termStartIso: "2023-09-25" },
    });
    expect(out?.currentFrom).toBe("2023-09-25");
    expect(out?.isCurrent).toBe(true);
  });

  it("uses next term as currentTo when supplied", () => {
    const out = resolveCurrentness({
      pattern: "term-keyed",
      signals: { termStartIso: "2023-09-25", nextTermStartIso: "2024-09-23" },
    });
    expect(out?.currentTo).toBe("2024-09-23");
    expect(out?.isCurrent).toBeUndefined();
  });
});

describe("resolveCurrentness — from-to-dated", () => {
  it("open-ended rows are current", () => {
    const out = resolveCurrentness({
      pattern: "from-to-dated",
      signals: { fromDate: "2024-01-01" },
    });
    expect(out?.isCurrent).toBe(true);
  });

  it("closed rows are not current", () => {
    const out = resolveCurrentness({
      pattern: "from-to-dated",
      signals: { fromDate: "2024-01-01", toDate: "2024-12-31" },
    });
    expect(out?.isCurrent).toBe(false);
    expect(out?.currentTo).toBe("2024-12-31");
  });
});

describe("resolveCurrentness — change-indicator (Banner SPRIDEN)", () => {
  it("null indicator means current", () => {
    expect(
      resolveCurrentness({ pattern: "change-indicator", signals: { changeIndicator: null } })
        ?.isCurrent
    ).toBe(true);
  });

  it("non-null indicator means not current", () => {
    expect(
      resolveCurrentness({
        pattern: "change-indicator",
        signals: { changeIndicator: "N" },
      })?.isCurrent
    ).toBe(false);
  });
});

describe("resolveCurrentness — status-driven (SITS)", () => {
  it("active status AND matching ayrc means current", () => {
    const out = resolveCurrentness({
      pattern: "status-driven",
      signals: { stac: "R", ayrc: "2024/25", currentAyrc: "2024/25" },
    });
    expect(out?.isCurrent).toBe(true);
  });

  it("active status but stale ayrc means not current", () => {
    const out = resolveCurrentness({
      pattern: "status-driven",
      signals: { stac: "R", ayrc: "2023/24", currentAyrc: "2024/25" },
    });
    expect(out?.isCurrent).toBe(false);
  });

  it("terminal status means not current even if ayrc matches", () => {
    const out = resolveCurrentness({
      pattern: "status-driven",
      signals: { stac: "W", ayrc: "2024/25", currentAyrc: "2024/25" },
    });
    expect(out?.isCurrent).toBe(false);
  });
});

describe("resolveCurrentness — snapshot", () => {
  it("takes observedAt as currentFrom and marks current", () => {
    const out = resolveCurrentness({
      pattern: "snapshot",
      signals: { observedAt: "2024-06-01T00:00:00Z" },
    });
    expect(out?.currentFrom).toBe("2024-06-01T00:00:00Z");
    expect(out?.isCurrent).toBe(true);
  });
});
