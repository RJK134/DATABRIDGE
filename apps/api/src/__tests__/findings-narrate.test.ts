import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AuditFinding } from "@databridge/rule-core";
import { build } from "../server.js";
import { getFindingsNarrateSink } from "../routes/findings-narrate.js";
import { InMemoryAuditStore, setAuditStore } from "../audit-store.js";

const okSlots = {
  headline_sentence: "We found 3 findings — 1 critical.",
  severity_breakdown_bullets: ["CRITICAL: 1", "ERROR: 2"],
  top_cluster_root_cause: "Codeset drift in Banner STVMAJR.",
  recommended_next_actions: [{ owner: "Registry", action: "Refresh the codeset.", priority: 1 }],
};

function f(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: "t-1",
    ruleId: "BANNER-NAT-01",
    ruleName: "Codeset drift",
    severity: "ERROR",
    entityType: "BannerStudent",
    subjectId: "p-1",
    message: "x",
    evidence: {},
    status: "new",
    detectedAt: "2026-05-26T00:00:00Z",
    ...over,
  } as AuditFinding;
}

describe("apps/api POST /v1/findings/:runId:narrate", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    getFindingsNarrateSink().clear();
    setAuditStore(new InMemoryAuditStore());
  });

  it("narrates inline findings via the deterministic mock", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/findings/inline:narrate",
      payload: {
        provider: "mock",
        cannedEntries: [{ match: "Total findings:", response: okSlots }],
        findings: [f({ severity: "CRITICAL" }), f({}), f({})],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      slots: { headline_sentence: string };
      text: string;
      markdown: string;
      provenance: { caller: string } | null;
    };
    expect(body.slots.headline_sentence).toContain("1 critical");
    expect(body.text).toContain("Refresh the codeset.");
    expect(body.markdown).toContain("# Findings narrative");
    expect(body.provenance?.caller).toBe("findings-narrative-llm");
  });

  it("short-circuits with no provider call when the findings list is empty", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/findings/inline:narrate",
      payload: { provider: "mock", findings: [] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      slots: { headline_sentence: string };
      provenance: unknown;
    };
    expect(body.slots.headline_sentence).toMatch(/No audit findings/);
    expect(body.provenance).toBeNull();
    expect(getFindingsNarrateSink().list()).toHaveLength(0);
  });

  it("returns 404 when the runId does not exist", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/findings/nope:narrate",
      payload: { provider: "mock" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 409 when the run is still queued / running", async () => {
    const store = new InMemoryAuditStore();
    await store.create({
      auditId: "run-1",
      tenantId: "t-1",
      profileId: "sits",
      status: "running",
    });
    setAuditStore(store);
    const res = await app.inject({
      method: "POST",
      url: "/v1/findings/run-1:narrate",
      payload: { provider: "mock" },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: string };
    expect(body.error).toBe("audit_not_ready");
  });

  it("narrates a stored, succeeded run via the AuditStore", async () => {
    const store = new InMemoryAuditStore();
    await store.create({
      auditId: "run-ok",
      tenantId: "t-1",
      profileId: "sits",
      status: "succeeded",
      report: {
        auditId: "run-ok",
        tenantId: "t-1",
        startedAt: "2026-05-26T00:00:00Z",
        completedAt: "2026-05-26T00:00:01Z",
        rulesTotal: 1,
        rulesSql: 0,
        rulesFn: 1,
        rowsScanned: 100,
        findingsTotal: 1,
        findingsBySeverity: { ERROR: 1 },
        findings: [f({ id: "stored-1" })],
        warnings: [],
      },
    });
    setAuditStore(store);
    const res = await app.inject({
      method: "POST",
      url: "/v1/findings/run-ok:narrate",
      payload: {
        provider: "mock",
        cannedEntries: [{ match: "Total findings:", response: okSlots }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { provenance: { caller: string } };
    expect(body.provenance.caller).toBe("findings-narrative-llm");
    expect(getFindingsNarrateSink().byCaller("findings-narrative-llm")).toHaveLength(1);
  });

  it("returns 422 when the LLM emits a grammar-violating slot set", async () => {
    const bad = { ...okSlots, severity_breakdown_bullets: [] };
    const res = await app.inject({
      method: "POST",
      url: "/v1/findings/inline:narrate",
      payload: {
        provider: "mock",
        cannedEntries: [{ match: "Total findings:", response: bad }],
        findings: [f({})],
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { error: string };
    expect(body.error).toBe("narrative_grammar_failed");
  });
});
