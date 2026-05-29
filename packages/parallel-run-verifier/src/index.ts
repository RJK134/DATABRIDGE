/**
 * Phase J4 — parallel-run verifier.
 *
 * Compares two parallel canonical projections (typically built from two
 * different source systems pointing at the same population) field by
 * field, then emits a CSV-friendly diff report and a DHP-style data
 * health score in [0, 1].
 */
import type { SampledRow } from "@databridge/adapter-spec";

export interface CanonicalRecord {
  /** Logical entity name (e.g. "student", "enrolment"). */
  entity: string;
  /** Stable identity key — typically a canonical AltId tuple flattened to a string. */
  id: string;
  /** Field-value bag as projected. */
  fields: SampledRow;
}

export type DiffStatus =
  | "match"
  | "mismatch"
  | "missing-in-a"
  | "missing-in-b"
  | "null-in-a"
  | "null-in-b";

export interface FieldDiff {
  entity: string;
  id: string;
  field: string;
  status: DiffStatus;
  a?: SampledRow[string] | null | undefined;
  b?: SampledRow[string] | null | undefined;
}

export interface EntityDhp {
  entity: string;
  /** Records compared in this entity (intersection of ids). */
  recordsCompared: number;
  /** Records present in A but not B. */
  missingInB: number;
  /** Records present in B but not A. */
  missingInA: number;
  fieldComparisons: number;
  fieldMatches: number;
  /** Data Health Percentage — matches / comparisons. NaN when zero comparisons. */
  dhp: number;
}

export interface VerificationReport {
  /** Per-entity DHP scores. */
  entityScores: EntityDhp[];
  /** All field-level diffs (only non-match rows). */
  diffs: FieldDiff[];
  /** Aggregate DHP across all entities. */
  overallDhp: number;
}

export interface VerifyOptions {
  /** Optional field-comparison overrides per entity. By default every
   *  field present in either A or B is compared. */
  fieldsByEntity?: Record<string, readonly string[]>;
  /** Treat null and undefined as equal; treat empty string as equal to null. */
  treatBlanksAsEqual?: boolean;
  /** Custom equality predicate. */
  equals?: (a: unknown, b: unknown) => boolean;
}

/** Build a Map keyed by `${entity}|${id}` for fast lookup. */
function index(records: CanonicalRecord[]): Map<string, CanonicalRecord> {
  const m = new Map<string, CanonicalRecord>();
  for (const r of records) m.set(`${r.entity}|${r.id}`, r);
  return m;
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/**
 * Compare two canonical projections.
 *
 * Aligns by `(entity, id)`. For each aligned pair, compares the union
 * (or explicit override) of fields and classifies each comparison.
 */
export function verifyCanonical(
  aRecords: CanonicalRecord[],
  bRecords: CanonicalRecord[],
  options: VerifyOptions = {}
): VerificationReport {
  const aIdx = index(aRecords);
  const bIdx = index(bRecords);
  const treatBlanksAsEqual = options.treatBlanksAsEqual ?? false;
  const equals = options.equals ?? defaultEquals;

  // Tally per-entity stats
  const stats = new Map<
    string,
    {
      recordsCompared: number;
      missingInA: number;
      missingInB: number;
      fieldComparisons: number;
      fieldMatches: number;
    }
  >();
  const ensureStats = (entity: string) => {
    let s = stats.get(entity);
    if (!s) {
      s = {
        recordsCompared: 0,
        missingInA: 0,
        missingInB: 0,
        fieldComparisons: 0,
        fieldMatches: 0,
      };
      stats.set(entity, s);
    }
    return s;
  };

  const diffs: FieldDiff[] = [];

  // Union of keys for "missing" detection
  const allKeys = new Set<string>([...aIdx.keys(), ...bIdx.keys()]);
  for (const key of allKeys) {
    const a = aIdx.get(key);
    const b = bIdx.get(key);
    if (a && !b) {
      const s = ensureStats(a.entity);
      s.missingInB += 1;
      diffs.push({
        entity: a.entity,
        id: a.id,
        field: "<record>",
        status: "missing-in-b",
      });
      continue;
    }
    if (b && !a) {
      const s = ensureStats(b.entity);
      s.missingInA += 1;
      diffs.push({
        entity: b.entity,
        id: b.id,
        field: "<record>",
        status: "missing-in-a",
      });
      continue;
    }
    if (!a || !b) continue;

    const s = ensureStats(a.entity);
    s.recordsCompared += 1;

    const fields = options.fieldsByEntity?.[a.entity] ?? [
      ...new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]),
    ];
    for (const f of fields) {
      const av = a.fields[f];
      const bv = b.fields[f];
      s.fieldComparisons += 1;
      const aBlank = isBlank(av);
      const bBlank = isBlank(bv);
      if (treatBlanksAsEqual && aBlank && bBlank) {
        s.fieldMatches += 1;
        continue;
      }
      if (aBlank && !bBlank) {
        diffs.push({
          entity: a.entity,
          id: a.id,
          field: f,
          status: "null-in-a",
          a: av ?? null,
          b: bv,
        });
        continue;
      }
      if (!aBlank && bBlank) {
        diffs.push({
          entity: a.entity,
          id: a.id,
          field: f,
          status: "null-in-b",
          a: av,
          b: bv ?? null,
        });
        continue;
      }
      if (equals(av, bv)) {
        s.fieldMatches += 1;
      } else {
        diffs.push({
          entity: a.entity,
          id: a.id,
          field: f,
          status: "mismatch",
          a: av,
          b: bv,
        });
      }
    }
  }

  const entityScores: EntityDhp[] = [];
  let allComparisons = 0;
  let allMatches = 0;
  for (const [entity, s] of stats) {
    const dhp = s.fieldComparisons === 0 ? Number.NaN : s.fieldMatches / s.fieldComparisons;
    entityScores.push({
      entity,
      recordsCompared: s.recordsCompared,
      missingInA: s.missingInA,
      missingInB: s.missingInB,
      fieldComparisons: s.fieldComparisons,
      fieldMatches: s.fieldMatches,
      dhp,
    });
    allComparisons += s.fieldComparisons;
    allMatches += s.fieldMatches;
  }
  const overallDhp = allComparisons === 0 ? Number.NaN : allMatches / allComparisons;
  return { entityScores, diffs, overallDhp };
}

function defaultEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (a == null && b == null) return true;
  // numeric-vs-stringy-numeric (common across SITS/Banner)
  if (typeof a === "number" && typeof b === "string") return String(a) === b;
  if (typeof b === "number" && typeof a === "string") return String(b) === a;
  return false;
}

/**
 * Emit the diff list as RFC-4180 CSV.
 * Columns: entity,id,field,status,a,b
 */
export function diffsToCsv(diffs: readonly FieldDiff[]): string {
  const head = "entity,id,field,status,a,b";
  const body = diffs.map((d) =>
    [d.entity, d.id, d.field, d.status, csvCell(d.a), csvCell(d.b)].join(",")
  );
  return [head, ...body].join("\n");
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a one-line human summary of the DHP scores.
 */
export function summariseDhp(report: VerificationReport): string {
  const parts: string[] = [];
  for (const e of report.entityScores) {
    const pct = Number.isNaN(e.dhp) ? "n/a" : `${(e.dhp * 100).toFixed(1)}%`;
    parts.push(`${e.entity}=${pct}(${e.recordsCompared})`);
  }
  const overall = Number.isNaN(report.overallDhp)
    ? "n/a"
    : `${(report.overallDhp * 100).toFixed(1)}%`;
  return `DHP overall=${overall} | ${parts.join(", ")}`;
}
