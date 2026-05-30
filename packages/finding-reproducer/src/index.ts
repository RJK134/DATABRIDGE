/**
 * Phase K4 — "Reproduce this finding".
 *
 * In the audit UI, every finding has a "reproduce" button. The expected
 * behaviour: click and instantly see exactly *why* the rule fired —
 * not by rerunning the engine, but by surfacing the artefacts captured
 * at evaluation time:
 *
 *   - The rule **predicate** (SQL text, function id, or expression),
 *     with binds substituted where they were known.
 *   - The **native row(s)** the predicate matched against — keyed by
 *     `nativeKeys` on the finding.
 *   - The **canonical projection** that the engine saw — the projected
 *     entity that the rule reasoned over.
 *   - The **target shape** that the migration runner would have written
 *     downstream, if applicable.
 *
 * This package is the assembly layer: it does *not* go fetch the native
 * row from the source DB. Instead, callers register row / canonical /
 * target *providers* keyed by source system or entity type. The
 * reproducer then composes the result. This matches Phase J's pattern
 * of pluggable adapters — production deployments wire DB-backed
 * providers; tests use in-memory fakes.
 */
import type { AuditFinding, RuleProvenance } from "@databridge/rule-core";

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export interface NativeRowRef {
  sourceSystem: string;
  nativeKeys: Record<string, string | number>;
}

export interface NativeRowProvider {
  /** True when this provider handles `sourceSystem`. */
  handles(sourceSystem: string): boolean;
  /** Returns the native row(s) the finding refers to, or undefined. */
  fetch(ref: NativeRowRef): Promise<Record<string, unknown> | undefined>;
}

export interface CanonicalProvider {
  handles(entityType: string): boolean;
  fetch(args: {
    entityType: string;
    subjectId: string;
    runId?: string;
  }): Promise<Record<string, unknown> | undefined>;
}

export interface TargetShapeProvider {
  /** True when this provider knows what shape would be written. */
  handles(entityType: string): boolean;
  /**
   * Returns the (would-be) downstream write shape. Pure — does NOT
   * actually write. Returns undefined when the migration runner does
   * not currently route this entity anywhere.
   */
  fetch(args: {
    entityType: string;
    subjectId: string;
    canonical: Record<string, unknown> | undefined;
  }): Promise<
    | {
        targetSystem: string;
        table: string;
        payload: Record<string, unknown>;
      }
    | undefined
  >;
}

// ---------------------------------------------------------------------------
// Output bundle
// ---------------------------------------------------------------------------

export interface ReproductionBundle {
  finding: AuditFinding;
  predicate: {
    kind: RuleProvenance["kind"] | "unknown";
    text: string;
    /** Binds with values substituted where known. */
    bindsResolved?: Record<string, unknown>;
  };
  nativeRow:
    | { available: true; sourceSystem: string; row: Record<string, unknown> }
    | { available: false; reason: string };
  canonical:
    | { available: true; entityType: string; record: Record<string, unknown> }
    | { available: false; reason: string };
  target:
    | {
        available: true;
        targetSystem: string;
        table: string;
        payload: Record<string, unknown>;
      }
    | { available: false; reason: string };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Reproducer
// ---------------------------------------------------------------------------

export interface ReproducerOptions {
  nativeProviders?: readonly NativeRowProvider[];
  canonicalProviders?: readonly CanonicalProvider[];
  targetProviders?: readonly TargetShapeProvider[];
  clock?: () => string;
}

export class FindingReproducer {
  private readonly nativeProviders: readonly NativeRowProvider[];
  private readonly canonicalProviders: readonly CanonicalProvider[];
  private readonly targetProviders: readonly TargetShapeProvider[];
  private readonly clock: () => string;

  constructor(options: ReproducerOptions = {}) {
    this.nativeProviders = options.nativeProviders ?? [];
    this.canonicalProviders = options.canonicalProviders ?? [];
    this.targetProviders = options.targetProviders ?? [];
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async reproduce(finding: AuditFinding): Promise<ReproductionBundle> {
    return {
      finding,
      predicate: derivePredicate(finding),
      nativeRow: await this.resolveNative(finding),
      canonical: await this.resolveCanonical(finding),
      target: await this.resolveTarget(finding),
      generatedAt: this.clock(),
    };
  }

  private async resolveNative(finding: AuditFinding): Promise<ReproductionBundle["nativeRow"]> {
    if (!finding.sourceSystem) {
      return { available: false, reason: "finding has no sourceSystem" };
    }
    if (!finding.nativeKeys || Object.keys(finding.nativeKeys).length === 0) {
      return { available: false, reason: "finding has no nativeKeys" };
    }
    const provider = this.nativeProviders.find((p) => p.handles(finding.sourceSystem!));
    if (!provider) {
      return {
        available: false,
        reason: `no NativeRowProvider for sourceSystem '${finding.sourceSystem}'`,
      };
    }
    try {
      const row = await provider.fetch({
        sourceSystem: finding.sourceSystem,
        nativeKeys: finding.nativeKeys,
      });
      if (!row) {
        return {
          available: false,
          reason: `provider returned no row for keys ${JSON.stringify(finding.nativeKeys)}`,
        };
      }
      return {
        available: true,
        sourceSystem: finding.sourceSystem,
        row,
      };
    } catch (err) {
      return {
        available: false,
        reason: `provider error: ${(err as Error).message}`,
      };
    }
  }

  private async resolveCanonical(finding: AuditFinding): Promise<ReproductionBundle["canonical"]> {
    const provider = this.canonicalProviders.find((p) => p.handles(finding.entityType));
    if (!provider) {
      return {
        available: false,
        reason: `no CanonicalProvider for entityType '${finding.entityType}'`,
      };
    }
    try {
      const args: {
        entityType: string;
        subjectId: string;
        runId?: string;
      } = {
        entityType: finding.entityType,
        subjectId: finding.subjectId,
      };
      if (finding.runId !== undefined) args.runId = finding.runId;
      const record = await provider.fetch(args);
      if (!record) {
        return {
          available: false,
          reason: `provider returned no canonical record for subject '${finding.subjectId}'`,
        };
      }
      return {
        available: true,
        entityType: finding.entityType,
        record,
      };
    } catch (err) {
      return {
        available: false,
        reason: `provider error: ${(err as Error).message}`,
      };
    }
  }

  private async resolveTarget(finding: AuditFinding): Promise<ReproductionBundle["target"]> {
    const provider = this.targetProviders.find((p) => p.handles(finding.entityType));
    if (!provider) {
      return {
        available: false,
        reason: `no TargetShapeProvider for entityType '${finding.entityType}'`,
      };
    }
    // We need the canonical first.
    const canonical = await this.resolveCanonical(finding);
    const canonicalRec = canonical.available ? canonical.record : undefined;
    try {
      const shape = await provider.fetch({
        entityType: finding.entityType,
        subjectId: finding.subjectId,
        canonical: canonicalRec,
      });
      if (!shape) {
        return {
          available: false,
          reason: "provider returned no target shape (entity not routed)",
        };
      }
      return {
        available: true,
        targetSystem: shape.targetSystem,
        table: shape.table,
        payload: shape.payload,
      };
    } catch (err) {
      return {
        available: false,
        reason: `provider error: ${(err as Error).message}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Predicate derivation
// ---------------------------------------------------------------------------

export function derivePredicate(finding: AuditFinding): ReproductionBundle["predicate"] {
  if (!finding.ruleProvenance) {
    return {
      kind: "unknown",
      text: `(no provenance — finding raised by ${finding.ruleId})`,
    };
  }
  const prov = finding.ruleProvenance;
  if (!prov.binds || Object.keys(prov.binds).length === 0) {
    return { kind: prov.kind, text: prov.predicate };
  }
  // Pure substitution — replace :name with the bound value's JSON repr.
  // Cosmetic only. SQL execution still uses real binds.
  let text = prov.predicate;
  for (const [k, v] of Object.entries(prov.binds)) {
    const literal = formatBind(v);
    text = text.replace(new RegExp(`:${escapeRegex(k)}\\b`, "g"), literal);
  }
  return {
    kind: prov.kind,
    text,
    bindsResolved: { ...prov.binds },
  };
}

function formatBind(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Pretty-printer
// ---------------------------------------------------------------------------

/** Render a bundle as a markdown block for embedding in UI / PR comments. */
export function bundleToMd(b: ReproductionBundle): string {
  const lines: string[] = [];
  lines.push(`### Finding ${b.finding.id} — ${b.finding.ruleName}`);
  lines.push(
    `_severity_ \`${b.finding.severity}\` · _entity_ \`${b.finding.entityType}\` · _subject_ \`${b.finding.subjectId}\``
  );
  lines.push("");
  lines.push("**Predicate**");
  lines.push(`\`\`\`${b.predicate.kind === "sql" ? "sql" : ""}`);
  lines.push(b.predicate.text);
  lines.push("```");
  lines.push("");
  lines.push("**Native row**");
  if (b.nativeRow.available) {
    lines.push("```json");
    lines.push(JSON.stringify(b.nativeRow.row, null, 2));
    lines.push("```");
  } else {
    lines.push(`_unavailable_ — ${b.nativeRow.reason}`);
  }
  lines.push("");
  lines.push("**Canonical**");
  if (b.canonical.available) {
    lines.push("```json");
    lines.push(JSON.stringify(b.canonical.record, null, 2));
    lines.push("```");
  } else {
    lines.push(`_unavailable_ — ${b.canonical.reason}`);
  }
  lines.push("");
  lines.push("**Target shape**");
  if (b.target.available) {
    lines.push(`_target system_ \`${b.target.targetSystem}\` · _table_ \`${b.target.table}\``);
    lines.push("```json");
    lines.push(JSON.stringify(b.target.payload, null, 2));
    lines.push("```");
  } else {
    lines.push(`_unavailable_ — ${b.target.reason}`);
  }
  return lines.join("\n");
}
