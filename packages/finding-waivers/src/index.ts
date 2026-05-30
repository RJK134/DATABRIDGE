/**
 * Phase K1 — finding waivers / acknowledgements.
 *
 * The audit pipeline emits {@link AuditFinding}s. Reviewers triaging a
 * finding need three things:
 *
 *   1. Acknowledge it (mark "we've seen this — keep flagging it"), without
 *      promising to fix it.
 *   2. Waive it for a bounded window (e.g. accept the risk for 30 days
 *      while a fix lands), with a reason and an owner.
 *   3. An audit trail — every waiver and acknowledgement is timestamped
 *      and attributed, and previous decisions are never silently lost
 *      when a finding is re-waived or revoked.
 *
 * `FindingWaiverStore` is the in-memory implementation. Production
 * deployments swap a DB-backed store conforming to the same shape — see
 * {@link FindingWaiverStoreLike} in this file. The store is keyed by
 * `findingId` (string) and operates strictly on metadata; it never
 * mutates the original {@link AuditFinding}. Use {@link applyWaiver} to
 * project the current waiver state onto a finding.
 */
import type { AuditFinding, AuditFindingStatus } from "@databridge/rule-core";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WaiverDecisionKind =
  /** Reviewer acknowledged the finding — still open, still surfaces. */
  | "ack"
  /** Reviewer waived the finding until a date — suppressed until then. */
  | "waive"
  /** Reviewer revoked an earlier waiver/ack — back to plain open. */
  | "revoke";

export interface WaiverDecision {
  /** Unique id for this decision. */
  id: string;
  /** Finding being decided on. */
  findingId: string;
  /** What was decided. */
  kind: WaiverDecisionKind;
  /** Who took the decision. Used for audit trail. */
  actor: string;
  /** Free-form reason. Required for "waive", optional for "ack"/"revoke". */
  reason?: string;
  /** ISO 8601 date the waiver expires. Required for "waive". */
  waivedUntil?: string;
  /** When the decision was recorded. */
  decidedAt: string;
}

export interface WaiverRecord {
  /** The decision currently in force. */
  current: WaiverDecision;
  /** Every prior decision, oldest first. */
  history: readonly WaiverDecision[];
}

export interface AckArgs {
  findingId: string;
  actor: string;
  reason?: string;
  at?: string;
}

export interface WaiveArgs {
  findingId: string;
  actor: string;
  reason: string;
  /** Must be in the future relative to `now`. */
  waivedUntil: string;
  at?: string;
}

export interface RevokeArgs {
  findingId: string;
  actor: string;
  reason?: string;
  at?: string;
}

export interface FindingWaiverStoreLike {
  ack(args: AckArgs): WaiverDecision;
  waive(args: WaiveArgs): WaiverDecision;
  revoke(args: RevokeArgs): WaiverDecision;
  get(findingId: string): WaiverRecord | undefined;
  list(filter?: { activeOnly?: boolean; at?: string }): WaiverRecord[];
  /** Snapshot for export. */
  toJSON(): WaiverRecord[];
  /** Restore from a snapshot. Replaces in-memory state. */
  loadSnapshot(records: readonly WaiverRecord[]): void;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class WaiverError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "missing_reason"
      | "invalid_until"
      | "no_active_waiver"
      | "unknown_finding"
      | "duplicate_decision"
  ) {
    super(message);
    this.name = "WaiverError";
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class FindingWaiverStore implements FindingWaiverStoreLike {
  private nextSeq = 1;
  private readonly records = new Map<string, WaiverRecord>();
  private readonly clock: () => string;

  constructor(clock?: () => string) {
    this.clock = clock ?? (() => new Date().toISOString());
  }

  ack(args: AckArgs): WaiverDecision {
    const now = args.at ?? this.clock();
    const decision: WaiverDecision = {
      id: this.mintId(),
      findingId: args.findingId,
      kind: "ack",
      actor: args.actor,
      decidedAt: now,
    };
    if (args.reason !== undefined) decision.reason = args.reason;
    this.upsert(decision);
    return decision;
  }

  waive(args: WaiveArgs): WaiverDecision {
    if (!args.reason || args.reason.trim() === "") {
      throw new WaiverError("waive requires a non-empty reason", "missing_reason");
    }
    const now = args.at ?? this.clock();
    if (!isFutureIso(args.waivedUntil, now)) {
      throw new WaiverError(
        `waivedUntil (${args.waivedUntil}) must be strictly after ${now}`,
        "invalid_until"
      );
    }
    const decision: WaiverDecision = {
      id: this.mintId(),
      findingId: args.findingId,
      kind: "waive",
      actor: args.actor,
      reason: args.reason,
      waivedUntil: args.waivedUntil,
      decidedAt: now,
    };
    this.upsert(decision);
    return decision;
  }

  revoke(args: RevokeArgs): WaiverDecision {
    const existing = this.records.get(args.findingId);
    if (!existing) {
      throw new WaiverError(
        `revoke called on ${args.findingId} which has no waiver/ack history`,
        "no_active_waiver"
      );
    }
    if (existing.current.kind === "revoke") {
      throw new WaiverError(`${args.findingId} is already revoked`, "duplicate_decision");
    }
    const now = args.at ?? this.clock();
    const decision: WaiverDecision = {
      id: this.mintId(),
      findingId: args.findingId,
      kind: "revoke",
      actor: args.actor,
      decidedAt: now,
    };
    if (args.reason !== undefined) decision.reason = args.reason;
    this.upsert(decision);
    return decision;
  }

  get(findingId: string): WaiverRecord | undefined {
    return this.records.get(findingId);
  }

  list(filter?: { activeOnly?: boolean; at?: string }): WaiverRecord[] {
    const at = filter?.at ?? this.clock();
    const out: WaiverRecord[] = [];
    for (const rec of this.records.values()) {
      if (filter?.activeOnly && !isActive(rec.current, at)) continue;
      out.push(rec);
    }
    return out;
  }

  toJSON(): WaiverRecord[] {
    return Array.from(this.records.values()).map((r) => ({
      current: r.current,
      history: [...r.history],
    }));
  }

  loadSnapshot(records: readonly WaiverRecord[]): void {
    this.records.clear();
    let maxSeq = 0;
    for (const r of records) {
      this.records.set(r.current.findingId, {
        current: r.current,
        history: [...r.history],
      });
      for (const d of [r.current, ...r.history]) {
        const m = /^wv-(\d+)$/.exec(d.id);
        if (m) {
          const n = parseInt(m[1]!, 10);
          if (n > maxSeq) maxSeq = n;
        }
      }
    }
    this.nextSeq = maxSeq + 1;
  }

  /** Stats for dashboards. */
  stats(at?: string): {
    total: number;
    activeWaivers: number;
    activeAcks: number;
    expiredWaivers: number;
    revoked: number;
  } {
    const ts = at ?? this.clock();
    let activeWaivers = 0;
    let activeAcks = 0;
    let expiredWaivers = 0;
    let revoked = 0;
    for (const r of this.records.values()) {
      const c = r.current;
      if (c.kind === "revoke") {
        revoked++;
      } else if (c.kind === "ack") {
        activeAcks++;
      } else if (c.kind === "waive") {
        if (isActive(c, ts)) activeWaivers++;
        else expiredWaivers++;
      }
    }
    return {
      total: this.records.size,
      activeWaivers,
      activeAcks,
      expiredWaivers,
      revoked,
    };
  }

  private mintId(): string {
    return `wv-${this.nextSeq++}`;
  }

  private upsert(decision: WaiverDecision): void {
    const existing = this.records.get(decision.findingId);
    if (existing) {
      this.records.set(decision.findingId, {
        current: decision,
        history: [...existing.history, existing.current],
      });
    } else {
      this.records.set(decision.findingId, {
        current: decision,
        history: [],
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when `until` is strictly after `now`. Both must be ISO 8601. */
export function isFutureIso(until: string, now: string): boolean {
  const u = Date.parse(until);
  const n = Date.parse(now);
  if (Number.isNaN(u) || Number.isNaN(n)) return false;
  return u > n;
}

/**
 * A decision is "active" when it is the current decision and (for waivers)
 * has not yet expired. Ack decisions remain active until revoked.
 */
export function isActive(decision: WaiverDecision, at: string): boolean {
  if (decision.kind === "revoke") return false;
  if (decision.kind === "ack") return true;
  if (decision.kind === "waive") {
    if (!decision.waivedUntil) return false;
    return isFutureIso(decision.waivedUntil, at);
  }
  return false;
}

/**
 * Project the current waiver state onto a finding. Pure — does not
 * mutate the input. When the waiver has expired, the projected status
 * reverts to `open` and the waivedUntil / waiverReason fields are cleared
 * so the next run treats the finding as live again.
 */
export function applyWaiver(
  finding: AuditFinding,
  record: WaiverRecord | undefined,
  at: string
): AuditFinding {
  if (!record) return finding;
  const c = record.current;
  if (c.kind === "revoke") {
    const { waivedUntil: _wu, waiverReason: _wr, ...rest } = finding;
    void _wu;
    void _wr;
    return { ...rest, status: "open" };
  }
  if (c.kind === "ack") {
    // Ack doesn't change suppression — finding stays open, but we
    // surface that it has been seen via status.
    const next: AuditFinding = { ...finding, status: "in_review" };
    if (c.reason !== undefined) next.resolutionNote = c.reason;
    next.resolvedBy = c.actor;
    return next;
  }
  if (c.kind === "waive") {
    if (!c.waivedUntil || !isFutureIso(c.waivedUntil, at)) {
      // Expired — revert.
      const { waivedUntil: _wu2, waiverReason: _wr2, ...rest } = finding;
      void _wu2;
      void _wr2;
      const expiredStatus: AuditFindingStatus = "open";
      return { ...rest, status: expiredStatus };
    }
    const next: AuditFinding = {
      ...finding,
      status: "waived",
      waivedUntil: c.waivedUntil,
    };
    if (c.reason !== undefined) next.waiverReason = c.reason;
    next.resolvedBy = c.actor;
    return next;
  }
  return finding;
}
