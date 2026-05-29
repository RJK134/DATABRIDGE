/**
 * Phase K2 — run-over-run finding delta.
 *
 * `computeFindingDelta(previous, current)` takes two arrays of
 * {@link AuditFinding}s — one snapshot from a previous audit run, one
 * from the current run — and classifies each into:
 *
 *   - **new**: present in `current` but not in `previous`
 *   - **resolved**: present in `previous` but not in `current`
 *   - **persistent**: present in both
 *   - **changed**: present in both but with a meaningfully different
 *     evidence/message/severity payload — surfaced separately so
 *     reviewers can see when a known finding has "moved"
 *
 * Identity is determined by an "issue key" — a stable tuple of
 * `(ruleId, entityType, subjectId, nativeKeysHash)`. Two findings with
 * the same key but on different `runId`s are considered the same logical
 * issue. Callers can override the key derivation if their rule packs
 * need a different notion of identity.
 */
import type { AuditFinding, RuleSeverity } from "@databridge/rule-core";

export type FindingDeltaKind = "new" | "resolved" | "persistent" | "changed";

export interface DeltaEntry {
  kind: FindingDeltaKind;
  /** The issue key derived from the finding(s). */
  key: string;
  /** The current-run finding (undefined for "resolved"). */
  current?: AuditFinding;
  /** The previous-run finding (undefined for "new"). */
  previous?: AuditFinding;
  /** Why "changed" — populated only for kind === "changed". */
  changeReasons?: readonly string[];
}

export interface FindingDeltaSummary {
  newCount: number;
  resolvedCount: number;
  persistentCount: number;
  changedCount: number;
  bySeverity: Record<RuleSeverity, { new: number; resolved: number }>;
}

export interface FindingDelta {
  entries: readonly DeltaEntry[];
  summary: FindingDeltaSummary;
  /** ISO timestamp the delta was computed. */
  computedAt: string;
}

export interface DeltaOptions {
  /** Override how identity is derived. Default = built-in tuple. */
  keyFn?: (f: AuditFinding) => string;
  /** Clock for `computedAt`. Default = `Date.now()`. */
  clock?: () => string;
}

const ZERO_SEV: Record<RuleSeverity, { new: number; resolved: number }> = {
  CRITICAL: { new: 0, resolved: 0 },
  ERROR: { new: 0, resolved: 0 },
  WARN: { new: 0, resolved: 0 },
  INFO: { new: 0, resolved: 0 },
};

/** Default issue-key — stable across runs for the same logical finding. */
export function defaultIssueKey(f: AuditFinding): string {
  const native = f.nativeKeys
    ? Object.keys(f.nativeKeys)
        .sort()
        .map((k) => `${k}=${String(f.nativeKeys![k])}`)
        .join("|")
    : "";
  return [f.ruleId, f.entityType, f.subjectId, native].join("::");
}

/**
 * Returns the list of reasons the two findings are considered "changed"
 * — empty array when they are equivalent enough to be "persistent".
 */
export function diffPayload(prev: AuditFinding, curr: AuditFinding): readonly string[] {
  const reasons: string[] = [];
  if (prev.severity !== curr.severity) {
    reasons.push(`severity ${prev.severity} → ${curr.severity}`);
  }
  if (prev.message !== curr.message) {
    reasons.push("message changed");
  }
  if (!evidenceEquivalent(prev.evidence, curr.evidence)) {
    reasons.push("evidence changed");
  }
  if ((prev.ruleProvenance?.predicate ?? "") !== (curr.ruleProvenance?.predicate ?? "")) {
    reasons.push("rule predicate changed");
  }
  return reasons;
}

function evidenceEquivalent(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    const k = ak[i]!;
    if (bk[i] !== k) return false;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  }
  return true;
}

export function computeFindingDelta(
  previous: readonly AuditFinding[],
  current: readonly AuditFinding[],
  options: DeltaOptions = {}
): FindingDelta {
  const keyFn = options.keyFn ?? defaultIssueKey;
  const clock = options.clock ?? (() => new Date().toISOString());

  const prevByKey = new Map<string, AuditFinding>();
  for (const f of previous) prevByKey.set(keyFn(f), f);
  const currByKey = new Map<string, AuditFinding>();
  for (const f of current) currByKey.set(keyFn(f), f);

  const entries: DeltaEntry[] = [];
  const bySeverity: Record<RuleSeverity, { new: number; resolved: number }> = {
    CRITICAL: { new: 0, resolved: 0 },
    ERROR: { new: 0, resolved: 0 },
    WARN: { new: 0, resolved: 0 },
    INFO: { new: 0, resolved: 0 },
  };

  let newCount = 0;
  let resolvedCount = 0;
  let persistentCount = 0;
  let changedCount = 0;

  // Walk current — classify new / persistent / changed.
  for (const [key, curr] of currByKey) {
    const prev = prevByKey.get(key);
    if (!prev) {
      entries.push({ kind: "new", key, current: curr });
      newCount++;
      bySeverity[curr.severity].new++;
      continue;
    }
    const reasons = diffPayload(prev, curr);
    if (reasons.length === 0) {
      entries.push({ kind: "persistent", key, previous: prev, current: curr });
      persistentCount++;
    } else {
      entries.push({
        kind: "changed",
        key,
        previous: prev,
        current: curr,
        changeReasons: reasons,
      });
      changedCount++;
    }
  }

  // Walk previous — anything not in current is resolved.
  for (const [key, prev] of prevByKey) {
    if (!currByKey.has(key)) {
      entries.push({ kind: "resolved", key, previous: prev });
      resolvedCount++;
      bySeverity[prev.severity].resolved++;
    }
  }

  return {
    entries,
    summary: {
      newCount,
      resolvedCount,
      persistentCount,
      changedCount,
      bySeverity,
    },
    computedAt: clock(),
  };
}

/** Helper: filter the delta to a single kind. */
export function filterDelta(delta: FindingDelta, kind: FindingDeltaKind): DeltaEntry[] {
  return delta.entries.filter((e) => e.kind === kind);
}

/**
 * Emit a markdown-ready summary table. Useful for PR comments and
 * Slack messages.
 */
export function summariseDeltaMd(delta: FindingDelta): string {
  const s = delta.summary;
  const lines: string[] = [];
  lines.push("| metric | count |");
  lines.push("| --- | ---: |");
  lines.push(`| new | ${s.newCount} |`);
  lines.push(`| resolved | ${s.resolvedCount} |`);
  lines.push(`| persistent | ${s.persistentCount} |`);
  lines.push(`| changed | ${s.changedCount} |`);
  lines.push("");
  lines.push("**By severity (new / resolved):**");
  lines.push("| severity | new | resolved |");
  lines.push("| --- | ---: | ---: |");
  for (const sev of ["CRITICAL", "ERROR", "WARN", "INFO"] as const) {
    const v = s.bySeverity[sev];
    lines.push(`| ${sev} | ${v.new} | ${v.resolved} |`);
  }
  return lines.join("\n");
}

export const __INTERNAL__ = { ZERO_SEV };
