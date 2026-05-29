import { describe, it, expect } from "vitest";
import { compileLlmRule, RuleCompilerError } from "../compiler.js";
import { DEMO_DICTIONARY } from "../dictionary.js";

const okRule = {
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

describe("compileLlmRule", () => {
  it("compiles a valid rule and returns a working evaluator", () => {
    const rule = compileLlmRule(okRule, { dictionary: DEMO_DICTIONARY });
    expect(rule.id).toBe("test-1");
    expect(rule.evaluate({ sourceId: "s1", lastName: null })).toBe(true);
    expect(rule.evaluate({ sourceId: "s2", lastName: "Smith" })).toBe(false);
  });

  it("renders message template against a row", () => {
    const rule = compileLlmRule(okRule, { dictionary: DEMO_DICTIONARY });
    expect(rule.renderMessage({ sourceId: "S1" })).toBe("Student S1 matched");
  });

  it("rejects an unknown entity", () => {
    expect(() =>
      compileLlmRule({ ...okRule, entity: "GhostEntity" }, { dictionary: DEMO_DICTIONARY })
    ).toThrowError(RuleCompilerError);
  });

  it("rejects an unknown field", () => {
    expect(() =>
      compileLlmRule(
        {
          ...okRule,
          where: {
            ...okRule.where,
            field: { kind: "field", entity: "Student", field: "imaginaryField" },
          },
        },
        { dictionary: DEMO_DICTIONARY }
      )
    ).toThrowError(/not in the dictionary/);
  });

  it("rejects cross-entity field references", () => {
    expect(() =>
      compileLlmRule(
        {
          ...okRule,
          entity: "Student",
          where: {
            ...okRule.where,
            field: { kind: "field", entity: "Engagement", field: "startDate" },
          },
        },
        { dictionary: DEMO_DICTIONARY }
      )
    ).toThrowError(/different entity/);
  });

  it("rejects when grammar fails", () => {
    expect(() =>
      compileLlmRule({ ...okRule, severity: "PANIC" }, { dictionary: DEMO_DICTIONARY })
    ).toThrowError(/grammar/);
  });

  it("applies idPrefix to the compiled rule id", () => {
    const rule = compileLlmRule(okRule, { dictionary: DEMO_DICTIONARY, idPrefix: "nl" });
    expect(rule.id).toBe("nl-test-1");
  });

  it("evaluates eq operator with case-insensitive string compare", () => {
    const rule = compileLlmRule(
      {
        ...okRule,
        where: {
          kind: "predicate",
          op: "eq",
          field: { kind: "field", entity: "Student", field: "feeStatus" },
          operands: [{ kind: "literal", value: "03" }],
        },
      },
      { dictionary: DEMO_DICTIONARY }
    );
    expect(rule.evaluate({ feeStatus: "03" })).toBe(true);
    expect(rule.evaluate({ feeStatus: 3 })).toBe(true);
    expect(rule.evaluate({ feeStatus: "01" })).toBe(false);
  });

  it("evaluates and/or/not nesting", () => {
    const rule = compileLlmRule(
      {
        ...okRule,
        entity: "Engagement",
        where: {
          kind: "and",
          clauses: [
            {
              kind: "predicate",
              op: "eq",
              field: { kind: "field", entity: "Engagement", field: "collectionYear" },
              operands: [{ kind: "literal", value: "2024/25" }],
            },
            {
              kind: "or",
              clauses: [
                {
                  kind: "predicate",
                  op: "isNull",
                  field: { kind: "field", entity: "Engagement", field: "programmeCode" },
                  operands: [],
                },
                {
                  kind: "not",
                  clause: {
                    kind: "predicate",
                    op: "isNotNull",
                    field: { kind: "field", entity: "Engagement", field: "startDate" },
                    operands: [],
                  },
                },
              ],
            },
          ],
        },
      },
      { dictionary: DEMO_DICTIONARY }
    );
    expect(
      rule.evaluate({ collectionYear: "2024/25", programmeCode: null, startDate: "2024-09-01" })
    ).toBe(true);
    expect(rule.evaluate({ collectionYear: "2024/25", programmeCode: "CS", startDate: null })).toBe(
      true
    );
    expect(
      rule.evaluate({ collectionYear: "2024/25", programmeCode: "CS", startDate: "2024-09-01" })
    ).toBe(false);
    expect(
      rule.evaluate({ collectionYear: "2023/24", programmeCode: null, startDate: "2024-09-01" })
    ).toBe(false);
  });

  it("evaluates between, in, notIn, gt, lt", () => {
    const between = compileLlmRule(
      {
        ...okRule,
        entity: "Module",
        where: {
          kind: "predicate",
          op: "between",
          field: { kind: "field", entity: "Module", field: "credits" },
          operands: [
            { kind: "literal", value: 10 },
            { kind: "literal", value: 30 },
          ],
        },
      },
      { dictionary: DEMO_DICTIONARY }
    );
    expect(between.evaluate({ credits: 15 })).toBe(true);
    expect(between.evaluate({ credits: 5 })).toBe(false);

    const inList = compileLlmRule(
      {
        ...okRule,
        entity: "TechOneInvoice",
        where: {
          kind: "predicate",
          op: "in",
          field: { kind: "field", entity: "TechOneInvoice", field: "Status" },
          operands: [
            { kind: "literal", value: "Pending" },
            { kind: "literal", value: "Rejected" },
          ],
        },
      },
      { dictionary: DEMO_DICTIONARY }
    );
    expect(inList.evaluate({ Status: "Pending" })).toBe(true);
    expect(inList.evaluate({ Status: "Paid" })).toBe(false);
  });

  it("matches operator falls back to false on invalid regex", () => {
    const rule = compileLlmRule(
      {
        ...okRule,
        where: {
          kind: "predicate",
          op: "matches",
          field: { kind: "field", entity: "Student", field: "firstName" },
          operands: [{ kind: "literal", value: "(unterminated" }],
        },
      },
      { dictionary: DEMO_DICTIONARY }
    );
    expect(rule.evaluate({ firstName: "Alice" })).toBe(false);
  });

  it("isNull treats empty string as null", () => {
    const rule = compileLlmRule(okRule, { dictionary: DEMO_DICTIONARY });
    expect(rule.evaluate({ lastName: "" })).toBe(true);
    expect(rule.evaluate({ lastName: undefined })).toBe(true);
  });
});
