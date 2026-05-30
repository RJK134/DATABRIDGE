import type { EffectiveDating, EffectiveDatingPattern } from "@databridge/canonical";

/**
 * Resolver input — a row from a source adapter plus the pattern that source
 * uses for the resource in question. The resolver does NOT touch DB clients;
 * the adapter is responsible for handing in the relevant columns.
 */
export interface CurrentnessInput {
  pattern: EffectiveDatingPattern;
  /**
   * Pattern-specific signal columns. Keys we look up:
   *   - activity-dated:    activityDate (ISO), latestActivityDate (ISO)
   *   - term-keyed:        termCodeEff (string), termStartIso (ISO), nextTermStartIso? (ISO)
   *   - from-to-dated:     fromDate (ISO), toDate? (ISO)
   *   - change-indicator:  changeIndicator (string|null) — null = current
   *   - status-driven:     stac (string), ayrc (string), currentAyrc (string)
   *   - snapshot:          observedAt (ISO)
   */
  signals: Record<string, string | null | undefined>;
}

/**
 * Resolve a source-system row's effective-dating into the uniform
 * `EffectiveDating` shape. Returns `undefined` only when the input is so
 * underspecified that nothing meaningful can be inferred.
 */
export function resolveCurrentness(input: CurrentnessInput): EffectiveDating | undefined {
  switch (input.pattern) {
    case "activity-dated":
      return resolveActivityDated(input.signals);
    case "term-keyed":
      return resolveTermKeyed(input.signals);
    case "from-to-dated":
      return resolveFromToDated(input.signals);
    case "change-indicator":
      return resolveChangeIndicator(input.signals);
    case "status-driven":
      return resolveStatusDriven(input.signals);
    case "snapshot":
      return resolveSnapshot(input.signals);
    default:
      return undefined;
  }
}

function resolveActivityDated(
  s: Record<string, string | null | undefined>
): EffectiveDating | undefined {
  const activity = s["activityDate"];
  if (!activity) return undefined;
  const latest = s["latestActivityDate"];
  // Banner "most recent wins" — this row is current iff its activity date
  // equals the latest observed activity date for this key.
  const isCurrent = latest !== undefined && latest !== null ? activity === latest : undefined;
  const out: EffectiveDating = {
    pattern: "activity-dated",
    currentFrom: activity,
  };
  if (isCurrent !== undefined) out.isCurrent = isCurrent;
  return out;
}

function resolveTermKeyed(
  s: Record<string, string | null | undefined>
): EffectiveDating | undefined {
  const termStart = s["termStartIso"];
  if (!termStart) return undefined;
  const out: EffectiveDating = {
    pattern: "term-keyed",
    currentFrom: termStart,
  };
  const nextTerm = s["nextTermStartIso"];
  if (nextTerm) out.currentTo = nextTerm;
  // If no next term is supplied, treat as currently in-effect.
  if (!nextTerm) out.isCurrent = true;
  return out;
}

function resolveFromToDated(
  s: Record<string, string | null | undefined>
): EffectiveDating | undefined {
  const from = s["fromDate"];
  if (!from) return undefined;
  const to = s["toDate"];
  const out: EffectiveDating = {
    pattern: "from-to-dated",
    currentFrom: from,
  };
  if (to) out.currentTo = to;
  // Open-ended at the end => current.
  out.isCurrent = !to;
  return out;
}

function resolveChangeIndicator(
  s: Record<string, string | null | undefined>
): EffectiveDating | undefined {
  const ind = s["changeIndicator"];
  // Banner convention: SPRIDEN_CHANGE_IND IS NULL means current.
  const isCurrent = ind === null || ind === undefined || ind === "";
  return {
    pattern: "change-indicator",
    isCurrent,
  };
}

function resolveStatusDriven(
  s: Record<string, string | null | undefined>
): EffectiveDating | undefined {
  const stac = s["stac"];
  const ayrc = s["ayrc"];
  const currentAyrc = s["currentAyrc"];
  if (!stac || !ayrc) return undefined;
  // SITS "active + current ayr" semantics from crosswalk §15.9.
  const activeStatuses = ["R", "A", "U", "C"];
  const isCurrent = activeStatuses.includes(stac.toUpperCase()) && ayrc === currentAyrc;
  return {
    pattern: "status-driven",
    isCurrent,
  };
}

function resolveSnapshot(
  s: Record<string, string | null | undefined>
): EffectiveDating | undefined {
  const observed = s["observedAt"];
  if (!observed) return undefined;
  return {
    pattern: "snapshot",
    currentFrom: observed,
    isCurrent: true,
  };
}
