/**
 * Cross-system reconciliation report builder.
 *
 * Algorithm:
 *
 * 1. Run `reconcile(A, B, policy)` to get all non-rejected candidates,
 *    sorted by score descending.
 * 2. Walk the candidates greedily and assign each A-record to at most
 *    one B-record and vice versa (highest-scoring claim wins).
 * 3. For each accepted pair, compute field-level conflicts on a small
 *    set of identity-critical fields.
 * 4. Records that were never claimed go into `sourceAOnly` / `sourceBOnly`.
 *
 * The result is a deterministic, side-effect-free `ReconciliationReport`.
 */
import {
  reconcile,
  type MatchPolicy,
  type PersonRecord,
  type SourceSystemTag,
} from "@databridge/identity-reconciler";
import type { FieldConflict, MatchedPair, ReconciliationReport } from "./types.js";

/** Identity-critical fields checked for conflicts on matched pairs. */
const CONFLICT_FIELDS: Array<keyof PersonRecord> = [
  "firstName",
  "lastName",
  "middleNames",
  "dateOfBirth",
  "email",
  "husid",
  "ucasPid",
  "ownStuId",
];

function norm(v: string | undefined): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim().toLowerCase();
  return s.length === 0 ? undefined : s;
}

function detectConflicts(a: PersonRecord, b: PersonRecord): FieldConflict[] {
  const out: FieldConflict[] = [];
  for (const f of CONFLICT_FIELDS) {
    const av = norm(a[f] as string | undefined);
    const bv = norm(b[f] as string | undefined);
    if (av && bv && av !== bv) {
      const c: FieldConflict = { field: String(f) };
      const rawA = a[f];
      const rawB = b[f];
      if (rawA !== undefined && rawA !== null) c.valueA = String(rawA);
      if (rawB !== undefined && rawB !== null) c.valueB = String(rawB);
      out.push(c);
    }
  }
  return out;
}

/** Unique key for a PersonRecord — used to track claimed status. */
function pkey(r: PersonRecord): string {
  return `${r.system}::${r.sourceId}`;
}

/**
 * Build a reconciliation report between two source-system batches.
 *
 * The function does NOT presume `sourceA[i].system === systemA`; the
 * caller supplies the logical labels separately so this works equally
 * for "Banner vs SITS" or "SITS-prod vs SITS-stage" comparisons.
 */
export function buildReconciliationReport(args: {
  systemA: SourceSystemTag;
  systemB: SourceSystemTag;
  sourceA: readonly PersonRecord[];
  sourceB: readonly PersonRecord[];
  policy: MatchPolicy;
  generatedAt?: string;
}): ReconciliationReport {
  const candidates = reconcile(args.sourceA, args.sourceB, args.policy);

  const claimedA = new Set<string>();
  const claimedB = new Set<string>();
  const matched: MatchedPair[] = [];

  for (const cand of candidates) {
    const ka = pkey(cand.a);
    const kb = pkey(cand.b);
    if (claimedA.has(ka) || claimedB.has(kb)) continue;
    claimedA.add(ka);
    claimedB.add(kb);
    matched.push({
      a: cand.a,
      b: cand.b,
      candidate: cand,
      conflicts: detectConflicts(cand.a, cand.b),
    });
  }

  const sourceAOnly = args.sourceA.filter((r) => !claimedA.has(pkey(r)));
  const sourceBOnly = args.sourceB.filter((r) => !claimedB.has(pkey(r)));
  const conflicting = matched.filter((m) => m.conflicts.length > 0).length;

  return {
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    systemA: args.systemA,
    systemB: args.systemB,
    counts: {
      matched: matched.length,
      sourceAOnly: sourceAOnly.length,
      sourceBOnly: sourceBOnly.length,
      conflicting,
      totalA: args.sourceA.length,
      totalB: args.sourceB.length,
    },
    matched,
    sourceAOnly,
    sourceBOnly,
  };
}

/**
 * Format the report counts as a one-line summary suitable for logs or
 * the standup email.
 */
export function summariseReport(report: ReconciliationReport): string {
  const c = report.counts;
  return (
    `${c.matched} matched, ` +
    `${c.sourceAOnly} ${report.systemA}-only, ` +
    `${c.sourceBOnly} ${report.systemB}-only, ` +
    `${c.conflicting} conflicting ` +
    `(of ${c.totalA} ${report.systemA} × ${c.totalB} ${report.systemB})`
  );
}
