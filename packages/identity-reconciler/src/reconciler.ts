/**
 * Identity Reconciler — core matching engine.
 *
 * Given two batches of `PersonRecord` rows (typically "incoming" vs
 * "existing"), produce all candidate matches under the requested policy,
 * scored, classified into confidence bands, and accompanied by a list of
 * reasons.
 *
 * The three policies are:
 *
 *   exact          — only deterministic equality on a strong identifier
 *                    (husid / ucasPid / ownStuId / any altId tuple).
 *                    Score is binary: 1.0 if any strong id matches, else 0.
 *
 *   fuzzy          — name+DOB similarity. lastname must be within
 *                    `fuzzyNameDistance` (default 1), firstname within
 *                    same distance, DOB exact. Email match adds boost.
 *                    Score combines the per-field weights.
 *
 *   institutional  — caller declares an ordered list of fields that MUST
 *                    match exactly (e.g. ["husid"] or ["lastName","dateOfBirth","postcode"]).
 *                    Score is fraction of fields that matched, with all-or-
 *                    nothing thresholding.
 */
import { damerauLevenshtein, nameSimilarity } from "./distance.js";
import type {
  MatchCandidate,
  MatchConfidence,
  MatchPolicy,
  MatchReason,
  MergeLogEntry,
  PersonRecord,
} from "./types.js";

/** Default thresholds per policy. */
const DEFAULT_THRESHOLDS: Record<MatchPolicy["kind"], number> = {
  exact: 1.0,
  fuzzy: 0.7,
  institutional: 1.0,
};

/** Strong identifier names checked by the exact policy in priority order. */
const STRONG_ID_FIELDS = ["husid", "ucasPid", "ownStuId"] as const;

/** Lowercase + trim helper that treats undefined/empty as "no value". */
function norm(value: string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** Compare two altId arrays; return reasons for any overlapping tuple. */
function altIdMatches(a: PersonRecord, b: PersonRecord): MatchReason[] {
  const aIds = a.altIds ?? [];
  const bIds = b.altIds ?? [];
  if (aIds.length === 0 || bIds.length === 0) return [];
  const reasons: MatchReason[] = [];
  for (const x of aIds) {
    for (const y of bIds) {
      if (
        norm(x.system) === norm(y.system) &&
        norm(x.type) === norm(y.type) &&
        norm(x.value) === norm(y.value) &&
        norm(x.value) !== undefined
      ) {
        reasons.push({
          code: "altid-equal",
          message: `altId ${x.system}/${x.type}=${x.value} present on both records`,
          weight: 1.0,
        });
      }
    }
  }
  return reasons;
}

/** Compare two records under the exact policy. */
function scoreExact(
  a: PersonRecord,
  b: PersonRecord
): {
  score: number;
  reasons: MatchReason[];
} {
  const reasons: MatchReason[] = [];
  for (const field of STRONG_ID_FIELDS) {
    const av = norm(a[field]);
    const bv = norm(b[field]);
    if (av && bv && av === bv) {
      reasons.push({
        code: `${field}-equal`,
        message: `${field} matches exactly (${av})`,
        weight: 1.0,
      });
    }
  }
  reasons.push(...altIdMatches(a, b));
  return { score: reasons.length > 0 ? 1.0 : 0.0, reasons };
}

/** Compare two records under the fuzzy policy. */
function scoreFuzzy(
  a: PersonRecord,
  b: PersonRecord,
  maxNameDistance: number
): { score: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  let total = 0;

  // last name
  const aLast = norm(a.lastName);
  const bLast = norm(b.lastName);
  if (aLast && bLast) {
    const dist = damerauLevenshtein(aLast, bLast);
    if (dist === 0) {
      reasons.push({
        code: "lastname-equal",
        message: `lastName matches exactly (${aLast})`,
        weight: 0.35,
      });
      total += 0.35;
    } else if (dist <= maxNameDistance) {
      const sim = nameSimilarity(aLast, bLast);
      reasons.push({
        code: "lastname-fuzzy",
        message: `lastName within distance ${dist} (sim ${sim.toFixed(2)})`,
        weight: 0.25,
      });
      total += 0.25;
    }
  }

  // first name
  const aFirst = norm(a.firstName);
  const bFirst = norm(b.firstName);
  if (aFirst && bFirst) {
    const dist = damerauLevenshtein(aFirst, bFirst);
    if (dist === 0) {
      reasons.push({
        code: "firstname-equal",
        message: `firstName matches exactly (${aFirst})`,
        weight: 0.2,
      });
      total += 0.2;
    } else if (dist <= maxNameDistance) {
      const sim = nameSimilarity(aFirst, bFirst);
      reasons.push({
        code: "firstname-fuzzy",
        message: `firstName within distance ${dist} (sim ${sim.toFixed(2)})`,
        weight: 0.12,
      });
      total += 0.12;
    }
  }

  // dob — exact only
  const aDob = norm(a.dateOfBirth);
  const bDob = norm(b.dateOfBirth);
  if (aDob && bDob && aDob === bDob) {
    reasons.push({
      code: "dob-equal",
      message: `dateOfBirth matches exactly (${aDob})`,
      weight: 0.3,
    });
    total += 0.3;
  }

  // email exact match — strong boost
  const aEmail = norm(a.email);
  const bEmail = norm(b.email);
  if (aEmail && bEmail && aEmail === bEmail) {
    reasons.push({ code: "email-equal", message: `email matches exactly`, weight: 0.15 });
    total += 0.15;
  }

  // altId — additive boost
  const altReasons = altIdMatches(a, b);
  if (altReasons.length > 0) {
    reasons.push(...altReasons);
    total += 0.2; // capped at one boost regardless of count
  }

  return { score: Math.min(total, 1.0), reasons };
}

/** Compare two records under the institutional policy. */
function scoreInstitutional(
  a: PersonRecord,
  b: PersonRecord,
  fields: Array<keyof PersonRecord>
): { score: number; reasons: MatchReason[] } {
  if (fields.length === 0) return { score: 0, reasons: [] };
  const reasons: MatchReason[] = [];
  let matched = 0;
  for (const field of fields) {
    const av = norm(a[field] as string | undefined);
    const bv = norm(b[field] as string | undefined);
    if (av && bv && av === bv) {
      matched += 1;
      reasons.push({
        code: `${String(field)}-equal`,
        message: `${String(field)} matches exactly (${av})`,
        weight: 1 / fields.length,
      });
    }
  }
  // Institutional matches are all-or-nothing — partial scores do not promote.
  const score = matched === fields.length ? 1.0 : matched / fields.length;
  return { score, reasons };
}

/** Compute the confidence band from score, policy and reason mix. */
function classify(
  score: number,
  threshold: number,
  reasons: MatchReason[],
  policy: MatchPolicy["kind"]
): MatchConfidence {
  if (score >= threshold) {
    // Boost to "confident" if a strong identifier matched OR institutional/exact policy hit
    const hasStrongId = reasons.some(
      (r) => r.code === "husid-equal" || r.code === "ucasPid-equal" || r.code === "altid-equal"
    );
    if (policy === "exact" || policy === "institutional" || hasStrongId) return "confident";
    if (score >= threshold + 0.1) return "confident";
    return "review";
  }
  if (score >= threshold - 0.15) return "review";
  return "rejected";
}

/** Apply the policy to one pair and produce a `MatchCandidate`. */
export function scorePair(a: PersonRecord, b: PersonRecord, policy: MatchPolicy): MatchCandidate {
  const threshold = policy.threshold ?? DEFAULT_THRESHOLDS[policy.kind];
  let scored: { score: number; reasons: MatchReason[] };
  if (policy.kind === "exact") {
    scored = scoreExact(a, b);
  } else if (policy.kind === "fuzzy") {
    scored = scoreFuzzy(a, b, policy.fuzzyNameDistance ?? 1);
  } else {
    scored = scoreInstitutional(a, b, policy.institutionalFields ?? []);
  }
  return {
    a,
    b,
    policy: policy.kind,
    score: scored.score,
    confidence: classify(scored.score, threshold, scored.reasons, policy.kind),
    reasons: scored.reasons,
  };
}

/**
 * Reconcile two arrays of records, returning all candidate pairs whose
 * confidence is NOT `"rejected"`. Pairs are returned in descending score
 * order.
 *
 * Self-matches (same `system` + `sourceId`) are skipped; same-system pairs
 * are kept (useful for deduplication inside one source).
 */
export function reconcile(
  incoming: readonly PersonRecord[],
  existing: readonly PersonRecord[],
  policy: MatchPolicy
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  for (const a of incoming) {
    for (const b of existing) {
      if (a.system === b.system && a.sourceId === b.sourceId) continue;
      const cand = scorePair(a, b, policy);
      if (cand.confidence === "rejected") continue;
      candidates.push(cand);
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  return candidates;
}

/** Build a merge-log entry from a candidate plus the decision metadata. */
export function buildMergeLogEntry(args: {
  candidate: MatchCandidate;
  keptCanonicalId: string;
  mergedCanonicalId: string;
  decidedBy: string;
  decidedAt?: string;
}): MergeLogEntry {
  return {
    decidedAt: args.decidedAt ?? new Date().toISOString(),
    keptCanonicalId: args.keptCanonicalId,
    mergedCanonicalId: args.mergedCanonicalId,
    candidate: args.candidate,
    decidedBy: args.decidedBy,
  };
}
