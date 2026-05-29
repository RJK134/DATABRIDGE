import { describe, expect, it } from "vitest";
import type { AuditFinding } from "@databridge/rule-core";
import { FindingWaiverStore, WaiverError, applyWaiver, isActive, isFutureIso } from "../index.js";

const ISO_NOW = "2026-05-26T18:00:00.000Z";
const ISO_FUTURE = "2026-06-25T18:00:00.000Z";
const ISO_PAST = "2026-01-01T00:00:00.000Z";

function fixedClock(now: string): () => string {
  return () => now;
}

function makeFinding(overrides: Partial<AuditFinding> = {}): AuditFinding {
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
    detectedAt: ISO_NOW,
    ...overrides,
  };
}

describe("isFutureIso", () => {
  it("returns true when until is strictly after now", () => {
    expect(isFutureIso(ISO_FUTURE, ISO_NOW)).toBe(true);
  });
  it("returns false when until is now or earlier", () => {
    expect(isFutureIso(ISO_NOW, ISO_NOW)).toBe(false);
    expect(isFutureIso(ISO_PAST, ISO_NOW)).toBe(false);
  });
  it("returns false for bad input", () => {
    expect(isFutureIso("not-a-date", ISO_NOW)).toBe(false);
  });
});

describe("FindingWaiverStore.ack", () => {
  it("records an acknowledgement with no reason", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    const decision = store.ack({ findingId: "f-1", actor: "alice" });
    expect(decision.kind).toBe("ack");
    expect(decision.actor).toBe("alice");
    expect(decision.decidedAt).toBe(ISO_NOW);
    const rec = store.get("f-1");
    expect(rec?.current.kind).toBe("ack");
    expect(rec?.history).toEqual([]);
  });

  it("preserves prior decisions in history", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    store.ack({ findingId: "f-1", actor: "alice", reason: "first look" });
    store.ack({ findingId: "f-1", actor: "bob", reason: "second look" });
    const rec = store.get("f-1");
    expect(rec?.history).toHaveLength(1);
    expect(rec?.history[0]?.actor).toBe("alice");
    expect(rec?.current.actor).toBe("bob");
  });
});

describe("FindingWaiverStore.waive", () => {
  it("waives with a reason and future date", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    const decision = store.waive({
      findingId: "f-1",
      actor: "alice",
      reason: "fix in PR #42",
      waivedUntil: ISO_FUTURE,
    });
    expect(decision.kind).toBe("waive");
    expect(decision.waivedUntil).toBe(ISO_FUTURE);
    expect(decision.reason).toBe("fix in PR #42");
  });

  it("rejects empty reason", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    expect(() =>
      store.waive({
        findingId: "f-1",
        actor: "alice",
        reason: "  ",
        waivedUntil: ISO_FUTURE,
      })
    ).toThrow(WaiverError);
  });

  it("rejects past waivedUntil", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    try {
      store.waive({
        findingId: "f-1",
        actor: "alice",
        reason: "fix later",
        waivedUntil: ISO_PAST,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(WaiverError);
      expect((e as WaiverError).code).toBe("invalid_until");
    }
  });
});

describe("FindingWaiverStore.revoke", () => {
  it("revokes an existing decision", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    store.waive({
      findingId: "f-1",
      actor: "alice",
      reason: "fix in PR #42",
      waivedUntil: ISO_FUTURE,
    });
    const rev = store.revoke({ findingId: "f-1", actor: "carol" });
    expect(rev.kind).toBe("revoke");
    const rec = store.get("f-1");
    expect(rec?.current.kind).toBe("revoke");
    expect(rec?.history).toHaveLength(1);
    expect(rec?.history[0]?.kind).toBe("waive");
  });

  it("refuses to revoke when there is no history", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    expect(() => store.revoke({ findingId: "missing", actor: "carol" })).toThrow(/no waiver/);
  });

  it("refuses to revoke twice in a row", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    store.ack({ findingId: "f-1", actor: "alice" });
    store.revoke({ findingId: "f-1", actor: "carol" });
    expect(() => store.revoke({ findingId: "f-1", actor: "carol" })).toThrow(WaiverError);
  });
});

describe("list / stats", () => {
  it("filters active vs all", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    store.waive({
      findingId: "f-1",
      actor: "alice",
      reason: "x",
      waivedUntil: ISO_FUTURE,
    });
    store.ack({ findingId: "f-2", actor: "bob" });
    store.ack({ findingId: "f-3", actor: "carol" });
    store.revoke({ findingId: "f-3", actor: "carol" });
    expect(store.list().length).toBe(3);
    expect(store.list({ activeOnly: true, at: ISO_NOW }).length).toBe(2);
  });

  it("stats split correctly", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    store.waive({
      findingId: "f-1",
      actor: "a",
      reason: "x",
      waivedUntil: ISO_FUTURE,
    });
    store.ack({ findingId: "f-2", actor: "b" });
    const s = store.stats(ISO_NOW);
    expect(s.total).toBe(2);
    expect(s.activeWaivers).toBe(1);
    expect(s.activeAcks).toBe(1);
    expect(s.expiredWaivers).toBe(0);
  });
});

describe("snapshot / restore", () => {
  it("round-trips state", () => {
    const a = new FindingWaiverStore(fixedClock(ISO_NOW));
    a.waive({
      findingId: "f-1",
      actor: "alice",
      reason: "x",
      waivedUntil: ISO_FUTURE,
    });
    a.revoke({ findingId: "f-1", actor: "carol" });
    const snapshot = a.toJSON();
    const b = new FindingWaiverStore(fixedClock(ISO_NOW));
    b.loadSnapshot(snapshot);
    const r = b.get("f-1");
    expect(r?.current.kind).toBe("revoke");
    expect(r?.history).toHaveLength(1);
    // nextSeq should pick up beyond the highest restored seq
    const next = b.ack({ findingId: "f-2", actor: "alice" });
    expect(next.id).toMatch(/^wv-\d+$/);
    expect(parseInt(next.id.slice(3), 10)).toBeGreaterThan(2);
  });
});

describe("applyWaiver projection", () => {
  it("returns the finding unchanged when there is no record", () => {
    const f = makeFinding();
    expect(applyWaiver(f, undefined, ISO_NOW)).toBe(f);
  });

  it("projects an active waiver onto the finding", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    store.waive({
      findingId: "f-1",
      actor: "alice",
      reason: "fix later",
      waivedUntil: ISO_FUTURE,
    });
    const rec = store.get("f-1");
    const f = makeFinding();
    const projected = applyWaiver(f, rec, ISO_NOW);
    expect(projected.status).toBe("waived");
    expect(projected.waivedUntil).toBe(ISO_FUTURE);
    expect(projected.waiverReason).toBe("fix later");
    expect(projected.resolvedBy).toBe("alice");
  });

  it("reverts a finding when the waiver has expired", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    store.waive({
      findingId: "f-1",
      actor: "alice",
      reason: "x",
      waivedUntil: ISO_FUTURE,
    });
    const rec = store.get("f-1");
    const f = makeFinding({
      status: "waived",
      waivedUntil: ISO_FUTURE,
      waiverReason: "x",
    });
    // Evaluate at a time AFTER waivedUntil — should expire.
    const later = "2026-12-31T00:00:00.000Z";
    const projected = applyWaiver(f, rec, later);
    expect(projected.status).toBe("open");
    expect(projected.waivedUntil).toBeUndefined();
    expect(projected.waiverReason).toBeUndefined();
  });

  it("ack puts the finding into in_review", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    store.ack({ findingId: "f-1", actor: "alice", reason: "looked at it" });
    const rec = store.get("f-1");
    const f = makeFinding();
    const projected = applyWaiver(f, rec, ISO_NOW);
    expect(projected.status).toBe("in_review");
    expect(projected.resolvedBy).toBe("alice");
    expect(projected.resolutionNote).toBe("looked at it");
  });

  it("revoke resets the finding to open and clears waiver fields", () => {
    const store = new FindingWaiverStore(fixedClock(ISO_NOW));
    store.waive({
      findingId: "f-1",
      actor: "alice",
      reason: "x",
      waivedUntil: ISO_FUTURE,
    });
    store.revoke({ findingId: "f-1", actor: "carol" });
    const rec = store.get("f-1");
    const f = makeFinding({
      status: "waived",
      waivedUntil: ISO_FUTURE,
      waiverReason: "x",
    });
    const projected = applyWaiver(f, rec, ISO_NOW);
    expect(projected.status).toBe("open");
    expect(projected.waivedUntil).toBeUndefined();
    expect(projected.waiverReason).toBeUndefined();
  });
});

describe("isActive", () => {
  it("returns true for ack", () => {
    expect(
      isActive(
        {
          id: "wv-1",
          findingId: "f-1",
          kind: "ack",
          actor: "a",
          decidedAt: ISO_NOW,
        },
        ISO_NOW
      )
    ).toBe(true);
  });

  it("returns false for revoke", () => {
    expect(
      isActive(
        {
          id: "wv-1",
          findingId: "f-1",
          kind: "revoke",
          actor: "a",
          decidedAt: ISO_NOW,
        },
        ISO_NOW
      )
    ).toBe(false);
  });

  it("returns false for expired waive", () => {
    expect(
      isActive(
        {
          id: "wv-1",
          findingId: "f-1",
          kind: "waive",
          actor: "a",
          decidedAt: ISO_NOW,
          waivedUntil: ISO_PAST,
        },
        ISO_NOW
      )
    ).toBe(false);
  });
});
