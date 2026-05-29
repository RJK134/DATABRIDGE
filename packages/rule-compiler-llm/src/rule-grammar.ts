/**
 * Grammar for LLM-emitted rules.
 *
 * The LLM is constrained to a fixed JSON shape — no free SQL, no raw
 * strings beyond the enumerated predicate operands, no subqueries. Every
 * leaf operand must reference a canonical model entity + field (validated
 * against the dictionary at compile time) OR a literal of an allowed
 * scalar type.
 *
 * This grammar is the contract between the LLM and the deterministic
 * compiler: anything the compiler can't validate is rejected with a
 * structured error before any execution occurs.
 */
import { z } from "zod";

/** Allowed scalar literal types. */
export const ScalarLiteralZ = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);
export type ScalarLiteral = z.infer<typeof ScalarLiteralZ>;

/** Canonical field reference — `{entity}.{field}`. */
export const FieldRefZ = z.object({
  kind: z.literal("field"),
  entity: z.string().min(1).max(64),
  field: z.string().min(1).max(64),
});
export type FieldRef = z.infer<typeof FieldRefZ>;

/** Literal value operand. */
export const LiteralZ = z.object({
  kind: z.literal("literal"),
  value: ScalarLiteralZ,
});
export type Literal = z.infer<typeof LiteralZ>;

/** Operand — either a field reference or a literal. */
export const OperandZ = z.discriminatedUnion("kind", [FieldRefZ, LiteralZ]);
export type Operand = z.infer<typeof OperandZ>;

/** Allowed predicate operators. */
export const PREDICATE_OPS = [
  "eq",
  "neq",
  "in",
  "notIn",
  "isNull",
  "isNotNull",
  "gt",
  "lt",
  "gte",
  "lte",
  "between",
  "matches",
] as const;
export type PredicateOp = (typeof PREDICATE_OPS)[number];

/** Predicate clause. */
export const PredicateZ = z.object({
  kind: z.literal("predicate"),
  op: z.enum(PREDICATE_OPS),
  /** Left-hand side is always a field reference. */
  field: FieldRefZ,
  /** Operands; semantics depend on op. */
  operands: z.array(OperandZ).min(0).max(8).default([]),
});
/** Predicate post-parse shape. `operands` is always defined (defaulted). */
export interface Predicate {
  kind: "predicate";
  op: PredicateOp;
  field: FieldRef;
  operands: Operand[];
}

/** Logical AND / OR / NOT clauses — recursive. */
export interface ClauseAnd {
  kind: "and";
  clauses: Clause[];
}
export interface ClauseOr {
  kind: "or";
  clauses: Clause[];
}
export interface ClauseNot {
  kind: "not";
  clause: Clause;
}
export type Clause = Predicate | ClauseAnd | ClauseOr | ClauseNot;

export const ClauseZ: z.ZodType<Clause, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    PredicateZ,
    z.object({ kind: z.literal("and"), clauses: z.array(ClauseZ).min(1).max(16) }),
    z.object({ kind: z.literal("or"), clauses: z.array(ClauseZ).min(1).max(16) }),
    z.object({ kind: z.literal("not"), clause: ClauseZ }),
  ])
);

/** Severity values mirror @databridge/rule-core. */
export const RULE_SEVERITIES = ["CRITICAL", "ERROR", "WARN", "INFO"] as const;

/** The top-level grammar-compliant rule the LLM emits. */
export const LlmRuleZ = z.object({
  /** Stable id; the compiler may rewrite it deterministically. */
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/),
  /** Canonical entity this rule's row scope iterates over. */
  entity: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  severity: z.enum(RULE_SEVERITIES),
  /** Optional tags — alphanumeric + dash only. */
  tags: z
    .array(
      z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(32)
    )
    .max(16)
    .default([]),
  /** Message template — uses {{fieldName}} placeholders. NO HTML, NO markdown. */
  messageTemplate: z
    .string()
    .min(1)
    .max(400)
    .regex(/^[^<>`]*$/),
  /** The predicate that flags a row when it evaluates TRUE. */
  where: ClauseZ,
});
export type LlmRule = z.infer<typeof LlmRuleZ>;

/**
 * Convenience: enumerate every field-ref leaf in a clause tree. The
 * compiler uses this to validate every referenced field exists in the
 * dictionary.
 */
export function collectFieldRefs(clause: Clause): FieldRef[] {
  const out: FieldRef[] = [];
  walk(clause);
  return out;

  function walk(c: Clause): void {
    if (c.kind === "predicate") {
      out.push(c.field);
      for (const o of c.operands) {
        if (o.kind === "field") out.push(o);
      }
      return;
    }
    if (c.kind === "not") {
      walk(c.clause);
      return;
    }
    for (const inner of c.clauses) walk(inner);
  }
}

/**
 * Static safety-checks that don't depend on the dictionary. These run
 * before dictionary validation. Throwing here means the LLM emitted
 * something structurally unsafe even before we asked about field names.
 */
export function staticSafetyCheck(rule: LlmRule): void {
  // Defensive: zod has already rejected disallowed characters in
  // messageTemplate, but explicit guard makes the contract obvious.
  if (
    /(?:\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|TRUNCATE)\b)/i.test(rule.messageTemplate)
  ) {
    throw new Error("messageTemplate contains a SQL keyword — rejected");
  }
  walkOperandValues(rule.where, (v) => {
    if (typeof v === "string") {
      if (/^(\s*--|\s*\/\*|;\s*\w)/.test(v)) {
        throw new Error("operand looks like SQL injection — rejected");
      }
      if (v.length > 200) {
        throw new Error("operand string exceeds 200 chars — rejected");
      }
    }
  });
}

function walkOperandValues(clause: Clause, fn: (v: ScalarLiteral) => void): void {
  if (clause.kind === "predicate") {
    for (const o of clause.operands) {
      if (o.kind === "literal") fn(o.value);
    }
    return;
  }
  if (clause.kind === "not") {
    walkOperandValues(clause.clause, fn);
    return;
  }
  for (const c of clause.clauses) walkOperandValues(c, fn);
}
