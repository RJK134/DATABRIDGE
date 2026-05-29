/**
 * @databridge/findings-integration-prep
 *
 * Given two row-batches — a "source" extract (e.g. SITS / Banner students)
 * and a "target" CRM extract (e.g. Salesforce Contact, Dynamics contact) —
 * compute the integration-prep verdict for every source row: should it
 * `create`, `update`, or `reject` against the target? Optionally surface
 * the deltas that would be applied on update.
 *
 * Used by both the Salesforce and Dynamics 365 adapters. Pure functions;
 * no I/O.
 */
import type { SampledRow } from "@databridge/adapter-spec";

export type IntegrationVerdict = "create" | "update" | "reject" | "skip";

export interface IntegrationFinding {
  /** Source row identity (e.g. student code or HUSID). */
  sourceId: string;
  verdict: IntegrationVerdict;
  /** Target id when verdict=update; absent when verdict=create or reject. */
  targetId?: string;
  /** Field-level deltas — present when verdict=update. */
  deltas?: Array<{ field: string; sourceValue: unknown; targetValue: unknown }>;
  /** Free-form reason — required for reject; optional otherwise. */
  reason?: string;
}

export interface IntegrationPrepReport {
  generatedAt: string;
  sourceLabel: string;
  targetLabel: string;
  totals: {
    source: number;
    target: number;
    create: number;
    update: number;
    reject: number;
    skip: number;
  };
  findings: IntegrationFinding[];
}

export interface IntegrationPrepOptions {
  /** Field on each source row used as the matching key. */
  sourceKey: string;
  /** Field on each target row used as the matching key. */
  targetKey: string;
  /** Fields to compare for deltas. Missing field on either side counts as null. */
  compareFields: readonly string[];
  /** Optional row-level reject predicate; returns reason string when truthy. */
  rejectIf?: (row: SampledRow) => string | null;
  /**
   * Optional normaliser for the key — defaults to a lowercased trim. Set to
   * `(v) => String(v)` for case-sensitive identifier matches.
   */
  normaliseKey?: (value: unknown) => string;
}

export function generateIntegrationPrepReport(args: {
  source: readonly SampledRow[];
  target: readonly SampledRow[];
  sourceLabel: string;
  targetLabel: string;
  options: IntegrationPrepOptions;
}): IntegrationPrepReport {
  const normaliseKey = args.options.normaliseKey ?? defaultNormalise;
  const targetIndex = new Map<string, SampledRow>();
  for (const t of args.target) {
    const k = normaliseKey(t[args.options.targetKey]);
    if (!k) continue;
    targetIndex.set(k, t);
  }

  const findings: IntegrationFinding[] = [];
  const totals = {
    source: 0,
    target: args.target.length,
    create: 0,
    update: 0,
    reject: 0,
    skip: 0,
  };

  for (const s of args.source) {
    totals.source += 1;
    const sourceId = String(s[args.options.sourceKey] ?? "");
    const rejectReason = args.options.rejectIf?.(s);
    if (rejectReason) {
      findings.push({ sourceId, verdict: "reject", reason: rejectReason });
      totals.reject += 1;
      continue;
    }
    const key = normaliseKey(s[args.options.sourceKey]);
    if (!key) {
      findings.push({ sourceId, verdict: "skip", reason: "source key is empty" });
      totals.skip += 1;
      continue;
    }
    const t = targetIndex.get(key);
    if (!t) {
      findings.push({ sourceId, verdict: "create" });
      totals.create += 1;
      continue;
    }
    const deltas: NonNullable<IntegrationFinding["deltas"]> = [];
    for (const f of args.options.compareFields) {
      const sv = s[f] ?? null;
      const tv = t[f] ?? null;
      if (!equalsLoose(sv, tv)) {
        deltas.push({ field: f, sourceValue: sv, targetValue: tv });
      }
    }
    const targetId = String(t[args.options.targetKey] ?? "");
    if (deltas.length === 0) {
      findings.push({ sourceId, verdict: "skip", targetId, reason: "no differences" });
      totals.skip += 1;
    } else {
      findings.push({ sourceId, verdict: "update", targetId, deltas });
      totals.update += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceLabel: args.sourceLabel,
    targetLabel: args.targetLabel,
    totals,
    findings,
  };
}

function defaultNormalise(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

function equalsLoose(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}
