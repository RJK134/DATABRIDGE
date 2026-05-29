import { describe, it, expect } from "vitest";
import { LlmRuleZ, collectFieldRefs, staticSafetyCheck } from "../rule-grammar.js";

const baseRule = {
  id: "test-1",
  entity: "Student",
  name: "Test rule",
  description: "Test rule.",
  severity: "WARN",
  tags: ["test"],
  messageTemplate: "Student {{sourceId}} matched",
  where: {
    kind: "predicate",
    op: "isNull",
    field: { kind: "field", entity: "Student", field: "lastName" },
    operands: [],
  },
};

describe("LlmRuleZ grammar", () => {
  it("accepts a valid minimal rule", () => {
    expect(() => LlmRuleZ.parse(baseRule)).not.toThrow();
  });

  it("rejects unknown severity", () => {
    expect(() => LlmRuleZ.parse({ ...baseRule, severity: "PANIC" })).toThrow();
  });

  it("rejects message templates containing < or > or backticks", () => {
    expect(() => LlmRuleZ.parse({ ...baseRule, messageTemplate: "<script>" })).toThrow();
    expect(() => LlmRuleZ.parse({ ...baseRule, messageTemplate: "`echo`" })).toThrow();
  });

  it("rejects oversize ids", () => {
    expect(() => LlmRuleZ.parse({ ...baseRule, id: "x".repeat(65) })).toThrow();
  });

  it("rejects unknown predicate operators", () => {
    expect(() =>
      LlmRuleZ.parse({
        ...baseRule,
        where: { ...baseRule.where, op: "fancy" },
      })
    ).toThrow();
  });

  it("rejects literals over 200 chars", () => {
    expect(() =>
      LlmRuleZ.parse({
        ...baseRule,
        where: {
          kind: "predicate",
          op: "eq",
          field: { kind: "field", entity: "Student", field: "lastName" },
          operands: [{ kind: "literal", value: "x".repeat(201) }],
        },
      })
    ).toThrow();
  });

  it("accepts nested and/or/not clauses", () => {
    const rule = {
      ...baseRule,
      where: {
        kind: "and",
        clauses: [
          { ...baseRule.where },
          {
            kind: "or",
            clauses: [
              { ...baseRule.where },
              {
                kind: "not",
                clause: { ...baseRule.where },
              },
            ],
          },
        ],
      },
    };
    expect(() => LlmRuleZ.parse(rule)).not.toThrow();
  });

  it("collectFieldRefs returns every leaf reference", () => {
    const parsed = LlmRuleZ.parse({
      ...baseRule,
      where: {
        kind: "and",
        clauses: [
          { ...baseRule.where },
          {
            kind: "predicate",
            op: "eq",
            field: { kind: "field", entity: "Student", field: "feeStatus" },
            operands: [{ kind: "literal", value: "03" }],
          },
        ],
      },
    });
    expect(collectFieldRefs(parsed.where).map((r) => r.field)).toEqual(["lastName", "feeStatus"]);
  });

  it("collectFieldRefs surfaces field-typed operands too", () => {
    const parsed = LlmRuleZ.parse({
      ...baseRule,
      where: {
        kind: "predicate",
        op: "eq",
        field: { kind: "field", entity: "Student", field: "firstName" },
        operands: [{ kind: "field", entity: "Student", field: "lastName" }],
      },
    });
    expect(collectFieldRefs(parsed.where).map((r) => r.field)).toEqual(["firstName", "lastName"]);
  });

  it("staticSafetyCheck rejects SQL keywords smuggled into the message template", () => {
    const parsed = LlmRuleZ.parse({
      ...baseRule,
      messageTemplate: "Student {{sourceId}} DROP TABLE students",
    });
    expect(() => staticSafetyCheck(parsed)).toThrow(/SQL/);
  });

  it("staticSafetyCheck rejects SQL-injection-looking literal operands", () => {
    const parsed = LlmRuleZ.parse({
      ...baseRule,
      where: {
        kind: "predicate",
        op: "eq",
        field: { kind: "field", entity: "Student", field: "lastName" },
        operands: [{ kind: "literal", value: "-- comment" }],
      },
    });
    expect(() => staticSafetyCheck(parsed)).toThrow(/SQL injection/);
  });

  it("staticSafetyCheck rejects trailing-semicolon-then-statement literals", () => {
    const parsed = LlmRuleZ.parse({
      ...baseRule,
      where: {
        kind: "predicate",
        op: "eq",
        field: { kind: "field", entity: "Student", field: "lastName" },
        operands: [{ kind: "literal", value: "; DELETE" }],
      },
    });
    expect(() => staticSafetyCheck(parsed)).toThrow(/SQL injection/);
  });

  it("staticSafetyCheck passes a clean rule", () => {
    const parsed = LlmRuleZ.parse(baseRule);
    expect(() => staticSafetyCheck(parsed)).not.toThrow();
  });
});
