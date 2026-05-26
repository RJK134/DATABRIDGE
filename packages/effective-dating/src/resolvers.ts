/**
 * One resolver per documented effective-dating pattern.
 *
 * All resolvers are pure: they take a `rows` array + an `at` observation
 * date (or extra metadata) and return either the winning `ResolvedRow` or
 * `undefined` when no row is current at the supplied date.
 */
import type {
  ActivityDatedRow,
  ChangeIndicatorRow,
  FromToDatedRow,
  ResolvedRow,
  SnapshotRow,
  StatusDrivenRow,
  TermKeyedRow,
} from "./types.js";

/** ISO string comparison helper (lexicographic works for ISO 8601). */
function lte(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined) return true;
  if (b === undefined) return false;
  return a <= b;
}
function lt(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  return a < b;
}

/**
 * activity-dated — pick the row with the largest `activityDate` that is
 * <= `at`. Ties broken by array order (last one wins).
 */
export function resolveActivityDated<R extends ActivityDatedRow>(
  rows: readonly R[],
  at: string,
): ResolvedRow<R> | undefined {
  let winner: R | undefined;
  for (const r of rows) {
    if (!lte(r.activityDate, at)) continue;
    if (winner === undefined || r.activityDate >= winner.activityDate) {
      winner = r;
    }
  }
  if (!winner) return undefined;
  return {
    row: winner,
    effectiveDating: {
      pattern: "activity-dated",
      currentFrom: winner.activityDate,
      isCurrent: true,
    },
  };
}

/**
 * term-keyed — Banner records keyed by `TERM_CODE_EFF`. Caller must
 * supply each row's mapped `termEffectiveDate` (lookup happens outside).
 */
export function resolveTermKeyed<R extends TermKeyedRow>(
  rows: readonly R[],
  at: string,
): ResolvedRow<R> | undefined {
  let winner: R | undefined;
  for (const r of rows) {
    if (!lte(r.termEffectiveDate, at)) continue;
    if (winner === undefined || r.termEffectiveDate >= winner.termEffectiveDate) {
      winner = r;
    }
  }
  if (!winner) return undefined;
  return {
    row: winner,
    effectiveDating: {
      pattern: "term-keyed",
      currentFrom: winner.termEffectiveDate,
      isCurrent: true,
    },
  };
}

/**
 * from-to-dated — pick the row whose explicit window contains `at`.
 * Half-open: `validFrom <= at < validTo` (or `validTo` absent).
 */
export function resolveFromToDated<R extends FromToDatedRow>(
  rows: readonly R[],
  at: string,
): ResolvedRow<R> | undefined {
  for (const r of rows) {
    const startOk = lte(r.validFrom, at);
    const endOk = r.validTo === undefined ? true : lt(at, r.validTo);
    if (startOk && endOk) {
      const ed: ResolvedRow<R>["effectiveDating"] = {
        pattern: "from-to-dated",
        currentFrom: r.validFrom,
        isCurrent: true,
      };
      if (r.validTo !== undefined) ed.currentTo = r.validTo;
      return { row: r, effectiveDating: ed };
    }
  }
  return undefined;
}

/**
 * change-indicator — the single row with null/empty `changeIndicator` is
 * the current row. If multiple rows are current (shouldn't happen), the
 * one with the latest `activityDate` wins.
 */
export function resolveChangeIndicator<R extends ChangeIndicatorRow>(
  rows: readonly R[],
): ResolvedRow<R> | undefined {
  const current = rows.filter(
    (r) => r.changeIndicator === undefined || r.changeIndicator === null || r.changeIndicator === "",
  );
  if (current.length === 0) return undefined;
  current.sort((a, b) => {
    const ax = a.activityDate ?? "";
    const bx = b.activityDate ?? "";
    return bx.localeCompare(ax);
  });
  const winner = current[0];
  if (!winner) return undefined;
  const ed: ResolvedRow<R>["effectiveDating"] = {
    pattern: "change-indicator",
    isCurrent: true,
  };
  if (winner.activityDate !== undefined) ed.currentFrom = winner.activityDate;
  return { row: winner, effectiveDating: ed };
}

/**
 * status-driven — SITS "active + current ayr" dual column scheme.
 * Caller supplies the set of statuses that count as "active" and the
 * `currentAyr` value. Multiple matching rows is a data-integrity issue;
 * we return the first.
 */
export function resolveStatusDriven<R extends StatusDrivenRow>(
  rows: readonly R[],
  args: { activeStatuses: readonly string[]; currentAyr: string },
): ResolvedRow<R> | undefined {
  const active = new Set(args.activeStatuses);
  const winner = rows.find((r) => active.has(r.status) && r.ayr === args.currentAyr);
  if (!winner) return undefined;
  return {
    row: winner,
    effectiveDating: {
      pattern: "status-driven",
      isCurrent: true,
    },
  };
}

/** snapshot — exactly one row expected; returned verbatim. */
export function resolveSnapshot<R extends SnapshotRow>(
  rows: readonly R[],
): ResolvedRow<R> | undefined {
  if (rows.length === 0) return undefined;
  const winner = rows[0] as R;
  return {
    row: winner,
    effectiveDating: { pattern: "snapshot", isCurrent: true },
  };
}
