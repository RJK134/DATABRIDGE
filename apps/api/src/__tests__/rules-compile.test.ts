import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { build } from "../server.js";
import { getRuleCompileSink } from "../routes/rules-compile.js";

const validRule = {
  id: "missing-lastname",
  entity: "Student",
  name: "Students missing lastName",
  description: "Students whose lastName is null or empty.",
  severity: "ERROR",
  tags: ["identity"],
  messageTemplate: "Student {{sourceId}} is missing lastName",
  where: {
    kind: "predicate",
    op: "isNull",
    field: { kind: "field", entity: "Student", field: "lastName" },
    operands: [],
  },
};

describe("apps/api POST /v1/rules:compile", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    getRuleCompileSink().clear();
  });

  it("compiles a natural-language prompt via canned mock entries", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rules:compile",
      payload: {
        nl: "students with no last name",
        provider: "mock",
        cannedEntries: [{ match: "no last name", response: validRule }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      rule: { id: string; entity: string; severity: string };
      provenance: { caller: string; provider: string; promptHash: string };
    };
    expect(body.rule.id).toBe("nl-missing-lastname");
    expect(body.rule.entity).toBe("Student");
    expect(body.provenance.caller).toBe("rule-compiler-llm");
    expect(body.provenance.provider).toBe("deterministic-mock");
    expect(body.provenance.promptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("records the call provenance on the sink", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/rules:compile",
      payload: {
        nl: "students with no last name",
        provider: "mock",
        cannedEntries: [{ match: "no last name", response: validRule }],
      },
    });
    const sink = getRuleCompileSink();
    expect(sink.byCaller("rule-compiler-llm")).toHaveLength(1);
  });

  it("returns dryRunFindings when a dataset is supplied", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rules:compile",
      payload: {
        nl: "students with no last name",
        provider: "mock",
        cannedEntries: [{ match: "no last name", response: validRule }],
        dataset: [
          { sourceId: "S1", lastName: null },
          { sourceId: "S2", lastName: "Smith" },
          { sourceId: "S3", lastName: "" },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { dryRunFindings: number };
    expect(body.dryRunFindings).toBe(2);
  });

  it("returns 422 when the LLM emits a rule that fails the grammar", async () => {
    const badRule = { ...validRule, severity: "PANIC" };
    const res = await app.inject({
      method: "POST",
      url: "/v1/rules:compile",
      payload: {
        nl: "x",
        provider: "mock",
        cannedEntries: [{ match: "x", response: badRule }],
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { error: string; code: string };
    expect(body.error).toBe("rule_compile_failed");
  });

  it("returns 422 when the LLM references an unknown field", async () => {
    const ghostFieldRule = {
      ...validRule,
      where: {
        kind: "predicate",
        op: "isNull",
        field: { kind: "field", entity: "Student", field: "ghostField" },
        operands: [],
      },
    };
    const res = await app.inject({
      method: "POST",
      url: "/v1/rules:compile",
      payload: {
        nl: "x",
        provider: "mock",
        cannedEntries: [{ match: "x", response: ghostFieldRule }],
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { code: string };
    expect(body.code).toBe("DICTIONARY");
  });

  it("returns 400 on invalid request body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rules:compile",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("includes the safety statement: no SQL keywords smuggled into messageTemplate", async () => {
    const dangerous = {
      ...validRule,
      messageTemplate: "Student {{sourceId}} SELECT * FROM students",
    };
    const res = await app.inject({
      method: "POST",
      url: "/v1/rules:compile",
      payload: {
        nl: "x",
        provider: "mock",
        cannedEntries: [{ match: "x", response: dangerous }],
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { code: string };
    expect(body.code).toBe("SAFETY");
  });
});
