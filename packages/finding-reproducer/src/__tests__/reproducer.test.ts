import { describe, expect, it } from "vitest";
import type { AuditFinding } from "@databridge/rule-core";
import {
  bundleToMd,
  derivePredicate,
  FindingReproducer,
  type CanonicalProvider,
  type NativeRowProvider,
  type TargetShapeProvider,
} from "../index.js";

const ISO = "2026-05-26T18:00:00.000Z";

function f(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: "f-1",
    tenantId: "t-1",
    ruleId: "rule-x",
    ruleName: "Rule X",
    severity: "ERROR",
    entityType: "Student",
    subjectId: "s-1",
    message: "broken",
    evidence: {},
    status: "open",
    detectedAt: ISO,
    ...overrides,
  };
}

const fakeNative: NativeRowProvider = {
  handles: (s) => s === "banner-oracle",
  fetch: async ({ nativeKeys }) => ({
    SPRIDEN_ID: nativeKeys["pidm"],
    SPRIDEN_LAST_NAME: "EXAMPLE",
  }),
};

const fakeCanonical: CanonicalProvider = {
  handles: (e) => e === "Student",
  fetch: async ({ subjectId }) => ({
    id: subjectId,
    surname: "Example",
    programmeOfStudy: "BSC-COMP",
  }),
};

const fakeTarget: TargetShapeProvider = {
  handles: (e) => e === "Student",
  fetch: async ({ canonical }) => ({
    targetSystem: "sits",
    table: "SRA_STUDENT",
    payload: { STU_CODE: (canonical?.["id"] as string) ?? "?", STU_SNAME: "EXAMPLE" },
  }),
};

describe("derivePredicate", () => {
  it("returns unknown when no provenance", () => {
    const p = derivePredicate(f());
    expect(p.kind).toBe("unknown");
    expect(p.text).toMatch(/no provenance/);
  });

  it("returns the verbatim predicate when no binds", () => {
    const p = derivePredicate(
      f({
        ruleProvenance: {
          kind: "sql",
          predicate: "SELECT * FROM x WHERE y IS NULL",
        },
      })
    );
    expect(p.kind).toBe("sql");
    expect(p.text).toBe("SELECT * FROM x WHERE y IS NULL");
  });

  it("substitutes bound values into the predicate text", () => {
    const p = derivePredicate(
      f({
        ruleProvenance: {
          kind: "sql",
          predicate: "x = :id AND y > :threshold",
          binds: { id: "A1", threshold: 7 },
        },
      })
    );
    expect(p.text).toBe("x = 'A1' AND y > 7");
    expect(p.bindsResolved).toEqual({ id: "A1", threshold: 7 });
  });

  it("escapes apostrophes in string binds", () => {
    const p = derivePredicate(
      f({
        ruleProvenance: {
          kind: "sql",
          predicate: "name = :n",
          binds: { n: "O'Brien" },
        },
      })
    );
    expect(p.text).toBe("name = 'O''Brien'");
  });

  it("formats null binds as NULL", () => {
    const p = derivePredicate(
      f({
        ruleProvenance: {
          kind: "sql",
          predicate: "x IS :v",
          binds: { v: null },
        },
      })
    );
    expect(p.text).toBe("x IS NULL");
  });
});

describe("FindingReproducer", () => {
  it("returns the predicate even when no providers wired", async () => {
    const r = new FindingReproducer();
    const bundle = await r.reproduce(
      f({
        ruleProvenance: { kind: "fn", predicate: "students.noProgramme" },
      })
    );
    expect(bundle.predicate.kind).toBe("fn");
    expect(bundle.predicate.text).toBe("students.noProgramme");
    expect(bundle.nativeRow.available).toBe(false);
    expect(bundle.canonical.available).toBe(false);
    expect(bundle.target.available).toBe(false);
  });

  it("resolves the native row via provider", async () => {
    const r = new FindingReproducer({ nativeProviders: [fakeNative] });
    const bundle = await r.reproduce(
      f({
        sourceSystem: "banner-oracle",
        nativeKeys: { pidm: 12345 },
      })
    );
    expect(bundle.nativeRow.available).toBe(true);
    if (bundle.nativeRow.available) {
      expect(bundle.nativeRow.row["SPRIDEN_ID"]).toBe(12345);
    }
  });

  it("reports missing nativeKeys cleanly", async () => {
    const r = new FindingReproducer({ nativeProviders: [fakeNative] });
    const bundle = await r.reproduce(f({ sourceSystem: "banner-oracle" }));
    expect(bundle.nativeRow.available).toBe(false);
    if (!bundle.nativeRow.available) {
      expect(bundle.nativeRow.reason).toMatch(/nativeKeys/);
    }
  });

  it("reports missing sourceSystem cleanly", async () => {
    const r = new FindingReproducer({ nativeProviders: [fakeNative] });
    const bundle = await r.reproduce(f({ nativeKeys: { x: 1 } }));
    expect(bundle.nativeRow.available).toBe(false);
    if (!bundle.nativeRow.available) {
      expect(bundle.nativeRow.reason).toMatch(/sourceSystem/);
    }
  });

  it("reports no provider for source system", async () => {
    const r = new FindingReproducer({ nativeProviders: [fakeNative] });
    const bundle = await r.reproduce(f({ sourceSystem: "mystery", nativeKeys: { x: 1 } }));
    expect(bundle.nativeRow.available).toBe(false);
    if (!bundle.nativeRow.available) {
      expect(bundle.nativeRow.reason).toMatch(/no NativeRowProvider/);
    }
  });

  it("propagates provider errors as reasons", async () => {
    const erroring: NativeRowProvider = {
      handles: () => true,
      fetch: async () => {
        throw new Error("connection refused");
      },
    };
    const r = new FindingReproducer({ nativeProviders: [erroring] });
    const bundle = await r.reproduce(f({ sourceSystem: "x", nativeKeys: { y: 1 } }));
    expect(bundle.nativeRow.available).toBe(false);
    if (!bundle.nativeRow.available) {
      expect(bundle.nativeRow.reason).toMatch(/connection refused/);
    }
  });

  it("resolves canonical via provider", async () => {
    const r = new FindingReproducer({ canonicalProviders: [fakeCanonical] });
    const bundle = await r.reproduce(f());
    expect(bundle.canonical.available).toBe(true);
    if (bundle.canonical.available) {
      expect(bundle.canonical.record["surname"]).toBe("Example");
    }
  });

  it("resolves target shape, threading canonical through", async () => {
    const r = new FindingReproducer({
      canonicalProviders: [fakeCanonical],
      targetProviders: [fakeTarget],
    });
    const bundle = await r.reproduce(f());
    expect(bundle.target.available).toBe(true);
    if (bundle.target.available) {
      expect(bundle.target.targetSystem).toBe("sits");
      expect(bundle.target.table).toBe("SRA_STUDENT");
      expect(bundle.target.payload["STU_CODE"]).toBe("s-1");
    }
  });

  it("target unavailable when no provider", async () => {
    const r = new FindingReproducer();
    const bundle = await r.reproduce(f());
    expect(bundle.target.available).toBe(false);
  });

  it("respects custom clock", async () => {
    const r = new FindingReproducer({ clock: () => "FIXED" });
    const bundle = await r.reproduce(f());
    expect(bundle.generatedAt).toBe("FIXED");
  });
});

describe("bundleToMd", () => {
  it("renders all sections", async () => {
    const r = new FindingReproducer({
      nativeProviders: [fakeNative],
      canonicalProviders: [fakeCanonical],
      targetProviders: [fakeTarget],
    });
    const bundle = await r.reproduce(
      f({
        sourceSystem: "banner-oracle",
        nativeKeys: { pidm: 42 },
        ruleProvenance: { kind: "sql", predicate: "x IS NULL" },
      })
    );
    const md = bundleToMd(bundle);
    expect(md).toContain("Predicate");
    expect(md).toContain("Native row");
    expect(md).toContain("Canonical");
    expect(md).toContain("Target shape");
    expect(md).toContain("SRA_STUDENT");
  });

  it("renders unavailable sections with reason text", async () => {
    const r = new FindingReproducer();
    const bundle = await r.reproduce(f());
    const md = bundleToMd(bundle);
    expect(md).toMatch(/unavailable.*Provider|unavailable.*no/i);
  });
});
