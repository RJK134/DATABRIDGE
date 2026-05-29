/**
 * Unit tests for the AuditProgressEmitter (F3).
 *
 * Covers: publish/subscribe live delivery, history replay for late
 * subscribers, the historyCap bound, isTerminalStatus classifier, and the
 * forget() cleanup hook.
 */
import { afterEach, describe, expect, it } from "vitest";
import { auditProgress, isTerminalStatus, type AuditProgressEvent } from "../audit-progress.js";

function ev(
  auditId: string,
  status: AuditProgressEvent["status"],
  extra: Partial<AuditProgressEvent> = {}
): AuditProgressEvent {
  return { auditId, ts: new Date().toISOString(), status, ...extra };
}

describe("auditProgress emitter", () => {
  afterEach(() => {
    auditProgress._clearAll();
  });

  it("delivers live events to subscribers", () => {
    const seen: AuditProgressEvent[] = [];
    const unsub = auditProgress.subscribe("a1", (e) => seen.push(e));

    auditProgress.publish(ev("a1", "running"));
    auditProgress.publish(ev("a1", "succeeded"));

    expect(seen.map((e) => e.status)).toEqual(["running", "succeeded"]);
    unsub();
  });

  it("replays buffered history synchronously to late subscribers", () => {
    auditProgress.publish(ev("a2", "queued"));
    auditProgress.publish(ev("a2", "running"));
    auditProgress.publish(ev("a2", "succeeded"));

    const seen: AuditProgressEvent[] = [];
    const unsub = auditProgress.subscribe("a2", (e) => seen.push(e));

    expect(seen.map((e) => e.status)).toEqual(["queued", "running", "succeeded"]);
    unsub();
  });

  it("isolates events per auditId", () => {
    const seenA: AuditProgressEvent[] = [];
    const seenB: AuditProgressEvent[] = [];
    const ua = auditProgress.subscribe("a3", (e) => seenA.push(e));
    const ub = auditProgress.subscribe("b3", (e) => seenB.push(e));

    auditProgress.publish(ev("a3", "running"));
    auditProgress.publish(ev("b3", "failed", { message: "boom" }));

    expect(seenA.map((e) => e.status)).toEqual(["running"]);
    expect(seenB.map((e) => e.status)).toEqual(["failed"]);
    expect(seenB[0]?.message).toBe("boom");
    ua();
    ub();
  });

  it("caps history length at 200 entries", () => {
    for (let i = 0; i < 250; i++) {
      auditProgress.publish(ev("cap", "running", { metrics: { i } }));
    }
    const hist = auditProgress._historyFor("cap");
    expect(hist.length).toBe(200);
    // Oldest preserved should be index 50 (0..49 evicted).
    expect(hist[0]?.metrics?.["i"]).toBe(50);
    expect(hist[hist.length - 1]?.metrics?.["i"]).toBe(249);
  });

  it("unsubscribe stops further delivery without affecting history", () => {
    const seen: AuditProgressEvent[] = [];
    const unsub = auditProgress.subscribe("a4", (e) => seen.push(e));
    auditProgress.publish(ev("a4", "running"));
    unsub();
    auditProgress.publish(ev("a4", "succeeded"));

    expect(seen.map((e) => e.status)).toEqual(["running"]);
    // History keeps both for any future late subscriber.
    expect(auditProgress._historyFor("a4").map((e) => e.status)).toEqual(["running", "succeeded"]);
  });

  it("forget() clears history for the given audit", () => {
    auditProgress.publish(ev("gone", "running"));
    expect(auditProgress._historyFor("gone").length).toBe(1);
    auditProgress.forget("gone");
    expect(auditProgress._historyFor("gone").length).toBe(0);
  });
});

describe("isTerminalStatus", () => {
  it("classifies terminal states", () => {
    expect(isTerminalStatus("succeeded")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
  });
  it("classifies non-terminal states", () => {
    expect(isTerminalStatus("queued")).toBe(false);
    expect(isTerminalStatus("running")).toBe(false);
  });
});
