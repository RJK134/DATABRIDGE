import { describe, expect, it } from "vitest";
import {
  resolveActivityDated,
  resolveChangeIndicator,
  resolveFromToDated,
  resolveSnapshot,
  resolveStatusDriven,
  resolveTermKeyed,
} from "../index.js";

describe("resolveActivityDated", () => {
  const rows = [
    { activityDate: "2024-01-01", value: "v1" },
    { activityDate: "2025-03-15", value: "v2" },
    { activityDate: "2026-01-10", value: "v3" },
  ];

  it("returns the latest row at or before `at`", () => {
    const r = resolveActivityDated(rows, "2025-12-31");
    expect(r?.row.value).toBe("v2");
    expect(r?.effectiveDating.pattern).toBe("activity-dated");
    expect(r?.effectiveDating.currentFrom).toBe("2025-03-15");
  });

  it("returns undefined if `at` is before every row", () => {
    expect(resolveActivityDated(rows, "2020-01-01")).toBeUndefined();
  });

  it("returns the very latest row when `at` is in the future", () => {
    const r = resolveActivityDated(rows, "2099-01-01");
    expect(r?.row.value).toBe("v3");
  });
});

describe("resolveTermKeyed", () => {
  it("picks the latest term whose effective date is <= at", () => {
    const rows = [
      { termEffectiveDate: "2024-09-01", code: "T1" },
      { termEffectiveDate: "2025-09-01", code: "T2" },
    ];
    const r = resolveTermKeyed(rows, "2025-12-01");
    expect(r?.row.code).toBe("T2");
    expect(r?.effectiveDating.pattern).toBe("term-keyed");
  });
});

describe("resolveFromToDated", () => {
  const rows = [
    { validFrom: "2024-01-01", validTo: "2025-01-01", v: "a" },
    { validFrom: "2025-01-01", validTo: "2026-01-01", v: "b" },
    { validFrom: "2026-01-01", v: "c" },
  ];

  it("respects half-open window (validFrom inclusive, validTo exclusive)", () => {
    expect(resolveFromToDated(rows, "2024-06-01")?.row.v).toBe("a");
    expect(resolveFromToDated(rows, "2025-01-01")?.row.v).toBe("b");
    expect(resolveFromToDated(rows, "2026-01-01")?.row.v).toBe("c");
  });

  it("currentTo present when row has explicit validTo", () => {
    const r = resolveFromToDated(rows, "2024-06-01");
    expect(r?.effectiveDating.currentTo).toBe("2025-01-01");
  });

  it("currentTo absent for open-ended row", () => {
    const r = resolveFromToDated(rows, "2030-01-01");
    expect(r?.row.v).toBe("c");
    expect(r?.effectiveDating.currentTo).toBeUndefined();
  });

  it("returns undefined when `at` precedes every window", () => {
    expect(resolveFromToDated(rows, "2020-01-01")).toBeUndefined();
  });
});

describe("resolveChangeIndicator", () => {
  it("returns the row with null/empty change indicator", () => {
    const r = resolveChangeIndicator([
      { changeIndicator: "I", activityDate: "2024-01-01", v: "old1" },
      { changeIndicator: null,  activityDate: "2025-05-05", v: "current" },
      { changeIndicator: "U", activityDate: "2024-06-01", v: "old2" },
    ]);
    expect(r?.row.v).toBe("current");
    expect(r?.effectiveDating.pattern).toBe("change-indicator");
    expect(r?.effectiveDating.currentFrom).toBe("2025-05-05");
  });

  it("returns undefined when no current row exists", () => {
    expect(
      resolveChangeIndicator([
        { changeIndicator: "I", v: "x" },
        { changeIndicator: "U", v: "y" },
      ]),
    ).toBeUndefined();
  });
});

describe("resolveStatusDriven", () => {
  it("returns the active row matching the current ayr", () => {
    const rows = [
      { status: "C", ayr: "2024/5", v: "old" },
      { status: "A", ayr: "2025/6", v: "active-now" },
      { status: "W", ayr: "2025/6", v: "withdrawn" },
    ];
    const r = resolveStatusDriven(rows, { activeStatuses: ["A", "I"], currentAyr: "2025/6" });
    expect(r?.row.v).toBe("active-now");
  });

  it("returns undefined when no row matches both predicates", () => {
    const rows = [{ status: "W", ayr: "2025/6", v: "x" }];
    const r = resolveStatusDriven(rows, { activeStatuses: ["A"], currentAyr: "2025/6" });
    expect(r).toBeUndefined();
  });
});

describe("resolveSnapshot", () => {
  it("returns the first (and only) row", () => {
    const r = resolveSnapshot([{ v: "only" }]);
    expect(r?.row.v).toBe("only");
    expect(r?.effectiveDating.pattern).toBe("snapshot");
  });
  it("returns undefined for an empty input", () => {
    expect(resolveSnapshot([])).toBeUndefined();
  });
});
