/**
 * Phase J5 — pre-flight schema check.
 *
 * Verifies that destination tables / fields exist before a migration is
 * allowed to commit. Concretely: a Banner write that would set a UK
 * classification must check SHRDGMR.INST_HONOR exists in the target
 * schema (some Banner installations have not added that column), and
 * abort gracefully if not.
 *
 * The checker uses `TargetTransport.hasField` if the transport supports
 * it (the InMemoryTransport and any production Oracle/REST transport
 * should). Transports without `hasField` return an "unknown" verdict.
 */
import type { TargetTransport } from "@databridge/target-adapters";

/** A single field requirement: table + field name + the migration concern it gates. */
export interface FieldRequirement {
  table: string;
  field: string;
  gates: string;
}

/** Built-in requirement bundles, keyed by the migration concern. */
export const BUNDLED_REQUIREMENTS: Record<string, FieldRequirement[]> = {
  /** UK classification write requires SHRDGMR.INST_HONOR. */
  "banner-uk-classification": [
    {
      table: "SHRDGMR",
      field: "INST_HONOR",
      gates: "UK degree classification write",
    },
  ],
  /** Fee-status write requires SGBSTDN.RESD_CODE. */
  "banner-fee-status": [{ table: "SGBSTDN", field: "RESD_CODE", gates: "fee-status write" }],
  /** SITS fee-status write requires STU.STU_FESC. */
  "sits-fee-status": [{ table: "STU", field: "STU_FESC", gates: "SITS fee-status write" }],
  /** Banner component-mark write requires SHRTCKG.GRADE. */
  "banner-component-mark": [{ table: "SHRTCKG", field: "GRADE", gates: "component-mark write" }],
};

export type CheckVerdict = "ok" | "missing" | "unknown";

export interface FieldCheckResult {
  requirement: FieldRequirement;
  verdict: CheckVerdict;
  /** Reason text — included when verdict is missing or unknown. */
  reason?: string;
}

export interface PreFlightReport {
  checks: FieldCheckResult[];
  /** True when every check is "ok"; false otherwise. */
  passed: boolean;
  /** Number of checks that came back missing. */
  missing: number;
  /** Number of checks that came back unknown (transport had no hasField). */
  unknown: number;
}

export interface PreFlightArgs {
  transport: TargetTransport;
  /**
   * Either a named bundle ("banner-uk-classification" etc.) or an
   * explicit list of FieldRequirement objects.
   */
  requirements: string | readonly FieldRequirement[];
}

/**
 * Run a pre-flight check. Iterates the requirements and consults the
 * transport. The runner should refuse to call `commit` for a row whose
 * gate isn't met.
 */
export async function runPreFlightCheck(args: PreFlightArgs): Promise<PreFlightReport> {
  const reqs = resolveRequirements(args.requirements);
  const checks: FieldCheckResult[] = [];
  let missing = 0;
  let unknown = 0;

  for (const r of reqs) {
    if (typeof args.transport.hasField !== "function") {
      checks.push({
        requirement: r,
        verdict: "unknown",
        reason: "transport does not support hasField",
      });
      unknown += 1;
      continue;
    }
    try {
      const ok = await args.transport.hasField(r.table, r.field);
      if (ok) {
        checks.push({ requirement: r, verdict: "ok" });
      } else {
        missing += 1;
        checks.push({
          requirement: r,
          verdict: "missing",
          reason: `${r.table}.${r.field} not declared on target schema`,
        });
      }
    } catch (err) {
      unknown += 1;
      checks.push({
        requirement: r,
        verdict: "unknown",
        reason: `hasField threw: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return {
    checks,
    passed: missing === 0 && unknown === 0,
    missing,
    unknown,
  };
}

function resolveRequirements(
  input: string | readonly FieldRequirement[]
): readonly FieldRequirement[] {
  if (typeof input === "string") {
    const bundle = BUNDLED_REQUIREMENTS[input];
    if (!bundle) {
      throw new Error(`pre-flight-check: unknown requirement bundle "${input}"`);
    }
    return bundle;
  }
  return input;
}

/** Return a compact human-readable summary for logs. */
export function summarisePreFlight(report: PreFlightReport): string {
  if (report.passed) return `pre-flight: PASS (${report.checks.length} checks)`;
  return `pre-flight: FAIL — missing=${report.missing}, unknown=${report.unknown}`;
}
