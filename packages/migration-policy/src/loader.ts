/**
 * Migration-policy loader (J2).
 *
 * Two entry points:
 *   - `parseMigrationPolicy(input)` — strict full-bundle parse; throws on
 *     missing slots.
 *   - `parsePartialPolicy(input)` — accepts a fragment, fills missing
 *     slots from `POLICY_DEFAULTS`. Requires only `id`, `sourceSystem`,
 *     `targetSystem` to be present.
 *
 * Both accept either a JSON string or an already-parsed unknown object.
 */
import { MigrationPolicyZ, POLICY_DEFAULTS, type MigrationPolicy } from "./schema.js";
import { z } from "zod";

/** Internal — coerce string-or-object input to unknown. */
function coerce(input: string | unknown): unknown {
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch (err) {
      throw new Error(
        `migration-policy loader: input is not valid JSON: ${(err as Error).message}`
      );
    }
  }
  return input;
}

/**
 * Strict parse. Every policy slot must be present; throws zod errors
 * with field paths otherwise.
 */
export function parseMigrationPolicy(input: string | unknown): MigrationPolicy {
  const raw = coerce(input);
  const result = MigrationPolicyZ.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `migration-policy: invalid bundle — ${result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`
    );
  }
  return result.data;
}

/** Partial bundle shape — only the three required identifiers must be present. */
const PartialBundleHeadZ = z.object({
  id: z.string(),
  description: z.string().optional(),
  tenantId: z.string().optional(),
  sourceSystem: z.enum(["sits", "banner", "workday", "techone", "sjms5"]),
  targetSystem: z.enum(["sits", "banner", "workday", "techone", "sjms5"]),
});

/**
 * Permissive parse. Fills missing slots from `POLICY_DEFAULTS`. Useful
 * when authors only want to override one or two slots (e.g. "give me
 * the defaults but switch crnGenerator to hash").
 */
export function parsePartialPolicy(input: string | unknown): MigrationPolicy {
  const raw = coerce(input);
  if (typeof raw !== "object" || raw === null) {
    throw new Error("migration-policy: partial bundle must be an object");
  }
  const head = PartialBundleHeadZ.safeParse(raw);
  if (!head.success) {
    throw new Error(
      `migration-policy: partial bundle missing required headers — ${head.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`
    );
  }
  const fragment = raw as Record<string, unknown>;
  const merged: Record<string, unknown> = {
    id: head.data.id,
    sourceSystem: head.data.sourceSystem,
    targetSystem: head.data.targetSystem,
    crnGenerator: fragment["crnGenerator"] ?? POLICY_DEFAULTS.crnGenerator,
    scjAttempt: fragment["scjAttempt"] ?? POLICY_DEFAULTS.scjAttempt,
    multiCurriculum: fragment["multiCurriculum"] ?? POLICY_DEFAULTS.multiCurriculum,
    componentMark: fragment["componentMark"] ?? POLICY_DEFAULTS.componentMark,
    creditHour: fragment["creditHour"] ?? POLICY_DEFAULTS.creditHour,
    gradeScheme: fragment["gradeScheme"] ?? POLICY_DEFAULTS.gradeScheme,
    termToAcademicYear: fragment["termToAcademicYear"] ?? POLICY_DEFAULTS.termToAcademicYear,
    feeStatus: fragment["feeStatus"] ?? POLICY_DEFAULTS.feeStatus,
    classificationGap: fragment["classificationGap"] ?? POLICY_DEFAULTS.classificationGap,
    intercalation: fragment["intercalation"] ?? POLICY_DEFAULTS.intercalation,
  };
  if (head.data.description !== undefined) merged["description"] = head.data.description;
  if (head.data.tenantId !== undefined) merged["tenantId"] = head.data.tenantId;
  return parseMigrationPolicy(merged);
}

/**
 * Build a policy from defaults given only the three required headers.
 * Convenience wrapper used by tests and dry-run endpoints.
 */
export function buildDefaultPolicy(args: {
  id: string;
  sourceSystem: MigrationPolicy["sourceSystem"];
  targetSystem: MigrationPolicy["targetSystem"];
  description?: string;
  tenantId?: string;
}): MigrationPolicy {
  return parsePartialPolicy(args);
}
