/**
 * Compile structured LLM output into a runnable rule.
 *
 * Stages:
 *   1. Parse output through the grammar zod schema.
 *   2. Run static safety checks (`staticSafetyCheck`).
 *   3. Validate every field reference exists in the dictionary.
 *   4. Project into a `CompiledRule` shape that downstream evaluators
 *      can iterate over without re-parsing.
 *
 * The compiler never executes anything itself — it produces a rule plus
 * an evaluator function the caller can invoke against canonical rows.
 */
import {
  LlmRuleZ,
  collectFieldRefs,
  staticSafetyCheck,
  type Clause,
  type FieldRef,
  type LlmRule,
  type Predicate,
  type ScalarLiteral,
} from "./rule-grammar.js";
import {
  indexDictionary,
  type RuleDictionary,
} from "./dictionary.js";

export interface CompiledRule {
  id: string;
  entity: string;
  name: string;
  description: string;
  severity: LlmRule["severity"];
  tags: readonly string[];
  messageTemplate: string;
  /** Evaluate the predicate against one canonical row. */
  evaluate: (row: Record<string, unknown>) => boolean;
  /** Render the message template with row values substituted. */
  renderMessage: (row: Record<string, unknown>) => string;
  /** Diagnostic — every canonical field this rule reads. */
  fieldsRead: readonly FieldRef[];
}

export class RuleCompilerError extends Error {
  constructor(
    message: string,
    readonly code: "GRAMMAR" | "SAFETY" | "DICTIONARY" | "STRUCTURE",
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RuleCompilerError";
  }
}

export interface CompileOptions {
  dictionary: RuleDictionary;
  /** Override id with a deterministic prefix — used by the api endpoint. */
  idPrefix?: string;
}

export function compileLlmRule(raw: unknown, options: CompileOptions): CompiledRule {
  // 1. Grammar.
  const parsed = LlmRuleZ.safeParse(raw);
  if (!parsed.success) {
    throw new RuleCompilerError("rule failed grammar validation", "GRAMMAR", {
      issues: parsed.error.issues,
    });
  }
  const rule = parsed.data;

  // 2. Static safety.
  try {
    staticSafetyCheck(rule);
  } catch (err) {
    throw new RuleCompilerError(
      err instanceof Error ? err.message : String(err),
      "SAFETY",
    );
  }

  // 3. Dictionary validation.
  const dictIndex = indexDictionary(options.dictionary);
  const fieldRefs = collectFieldRefs(rule.where);
  // Always include the LHS implicit anchor — the rule's entity must have at
  // least one declared field in the dictionary.
  if (!hasEntity(options.dictionary, rule.entity)) {
    throw new RuleCompilerError(
      `entity "${rule.entity}" is not in the dictionary`,
      "DICTIONARY",
    );
  }
  for (const f of fieldRefs) {
    if (!dictIndex.has(`${f.entity}.${f.field}`)) {
      throw new RuleCompilerError(
        `field "${f.entity}.${f.field}" is not in the dictionary`,
        "DICTIONARY",
        { entity: f.entity, field: f.field },
      );
    }
    if (f.entity !== rule.entity) {
      // Cross-entity references aren't supported in Phase B. Reject
      // explicitly so the LLM cannot smuggle joins through field refs.
      throw new RuleCompilerError(
        `field "${f.entity}.${f.field}" references a different entity than the rule's "${rule.entity}"`,
        "STRUCTURE",
      );
    }
  }

  const id = options.idPrefix ? `${options.idPrefix}-${rule.id}` : rule.id;
  const evaluate = (row: Record<string, unknown>): boolean =>
    evalClause(rule.where, row);
  const renderMessage = (row: Record<string, unknown>): string =>
    renderTemplate(rule.messageTemplate, row);

  return {
    id,
    entity: rule.entity,
    name: rule.name,
    description: rule.description,
    severity: rule.severity,
    tags: rule.tags,
    messageTemplate: rule.messageTemplate,
    evaluate,
    renderMessage,
    fieldsRead: fieldRefs,
  };
}

function hasEntity(d: RuleDictionary, entity: string): boolean {
  for (const f of d.fields) {
    if (f.entity === entity) return true;
  }
  return false;
}

/* ─────────────────────────────────────────────────────────────────────
 *  Evaluator — pure functions over a row
 * ───────────────────────────────────────────────────────────────────── */

function evalClause(c: Clause, row: Record<string, unknown>): boolean {
  if (c.kind === "predicate") return evalPredicate(c, row);
  if (c.kind === "not") return !evalClause(c.clause, row);
  if (c.kind === "and") {
    for (const inner of c.clauses) if (!evalClause(inner, row)) return false;
    return true;
  }
  // OR.
  for (const inner of c.clauses) if (evalClause(inner, row)) return true;
  return false;
}

function evalPredicate(p: Predicate, row: Record<string, unknown>): boolean {
  const lhs = row[p.field.field];
  switch (p.op) {
    case "isNull":
      return lhs === null || lhs === undefined || lhs === "";
    case "isNotNull":
      return !(lhs === null || lhs === undefined || lhs === "");
    case "eq":
      return looseEq(lhs, valueOf(p.operands[0], row));
    case "neq":
      return !looseEq(lhs, valueOf(p.operands[0], row));
    case "in":
      return p.operands.some((o) => looseEq(lhs, valueOf(o, row)));
    case "notIn":
      return !p.operands.some((o) => looseEq(lhs, valueOf(o, row)));
    case "gt":
      return cmp(lhs, valueOf(p.operands[0], row)) > 0;
    case "lt":
      return cmp(lhs, valueOf(p.operands[0], row)) < 0;
    case "gte":
      return cmp(lhs, valueOf(p.operands[0], row)) >= 0;
    case "lte":
      return cmp(lhs, valueOf(p.operands[0], row)) <= 0;
    case "between": {
      const lo = valueOf(p.operands[0], row);
      const hi = valueOf(p.operands[1], row);
      return cmp(lhs, lo) >= 0 && cmp(lhs, hi) <= 0;
    }
    case "matches": {
      const pattern = valueOf(p.operands[0], row);
      if (typeof pattern !== "string") return false;
      try {
        return typeof lhs === "string" && new RegExp(pattern).test(lhs);
      } catch {
        return false;
      }
    }
  }
}

function valueOf(o: Predicate["operands"][number] | undefined, row: Record<string, unknown>): unknown {
  if (o === undefined) return undefined;
  if (o.kind === "literal") return o.value;
  return row[o.field];
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  // Number ↔ string comparison: coerce string to number when both sides are
  // numeric to avoid false negatives from JSON round-tripping.
  if (typeof a === "number" && typeof b === "string" && /^-?\d+(\.\d+)?$/.test(b)) {
    return a === Number(b);
  }
  if (typeof a === "string" && typeof b === "number" && /^-?\d+(\.\d+)?$/.test(a)) {
    return Number(a) === b;
  }
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  // Dates / strings sort lexically — date strings sort correctly in YYYY-MM-DD.
  const sa = a == null ? "" : String(a);
  const sb = b == null ? "" : String(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

function renderTemplate(tpl: string, row: Record<string, unknown>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = row[key];
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

/** Convenience: scalar-value type guard used by the parser tests. */
export function isScalarLiteral(v: unknown): v is ScalarLiteral {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}
