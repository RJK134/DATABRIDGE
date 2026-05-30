"use client";

/**
 * /query — NL → Rule → Findings demo query bar (Phase B / v1.4).
 *
 * Presenter types a natural-language question, picks a fixture, hits
 * Run. The page POSTs to /v1/rules:compile on the api gateway, which
 * compiles the LLM JSON output into a grammar-validated Rule and dry-
 * runs it against the bound dataset, returning the rule, the
 * provenance record, and the per-row findings.
 *
 * No SQL is ever sent to the LLM. Every call surfaces a provenance hash
 * pair the presenter can show to a customer.
 */
import { useState } from "react";
import { DEMO_FIXTURES, PROMPT_LIBRARY, type DemoFixtureId, type PromptDef } from "./fixtures";

interface FieldRefShape {
  entity: string;
  field: string;
}

interface RuleCompileResponse {
  rule: {
    id: string;
    entity: string;
    name: string;
    description: string;
    severity: string;
    tags: readonly string[];
    messageTemplate: string;
    fieldsRead: readonly FieldRefShape[];
  };
  provenance: {
    callId: string;
    timestamp: string;
    provider: string;
    model: string;
    promptHash: string;
    responseHash: string;
    latencyMs: number;
    tokens?: { input?: number; output?: number; total?: number };
    costUsd?: number;
  };
  dryRunFindings?: number;
}

interface CompileError {
  error: string;
  code?: string;
  message?: string;
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export default function QueryBarPage(): JSX.Element {
  const [nl, setNl] = useState<string>(PROMPT_LIBRARY[0]?.nl ?? "");
  const [fixtureId, setFixtureId] = useState<DemoFixtureId>("salesforce-edu-westmidlands");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RuleCompileResponse | null>(null);
  const [error, setError] = useState<CompileError | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const matchingPrompt = PROMPT_LIBRARY.find((p) => p.nl === nl);
      const fixture = DEMO_FIXTURES[fixtureId];
      const payload = {
        nl,
        provider: "mock",
        cannedEntries: matchingPrompt
          ? [{ match: matchingPrompt.nl, response: matchingPrompt.expectedRule }]
          : undefined,
        dataset: fixture.rows,
      };
      const res = await fetch(`${API_URL}/v1/rules:compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as RuleCompileResponse | CompileError;
      if (!res.ok) {
        setError(body as CompileError);
      } else {
        setResult(body as RuleCompileResponse);
      }
    } catch (err) {
      setError({
        error: "client_error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="query-page">
      <h2 style={{ marginTop: 0 }}>NL → Rule → Findings query bar</h2>
      <p style={{ maxWidth: 720, lineHeight: 1.5 }}>
        Type a natural-language question against one of the demo fixtures. DataBridge compiles a
        grammar-validated rule (no free SQL) and dry-runs it. The provenance hash pair on the
        response is what you show a customer to prove the call is auditable.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 12, marginBottom: 16 }}>
        <input
          data-testid="nl-input"
          aria-label="Natural-language prompt"
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          placeholder="e.g. contacts with duplicate emails"
          style={{
            padding: 10,
            fontSize: 14,
            borderRadius: 6,
            border: "1px solid #30363d",
            background: "#0d1117",
            color: "#e6edf3",
          }}
        />
        <select
          data-testid="fixture-select"
          aria-label="Bound dataset"
          value={fixtureId}
          onChange={(e) => setFixtureId(e.target.value as DemoFixtureId)}
          style={{
            padding: 10,
            fontSize: 14,
            borderRadius: 6,
            border: "1px solid #30363d",
            background: "#0d1117",
            color: "#e6edf3",
          }}
        >
          {(Object.keys(DEMO_FIXTURES) as DemoFixtureId[]).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          data-testid="run-button"
          onClick={run}
          disabled={busy}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            borderRadius: 6,
            border: "1px solid #30363d",
            background: busy ? "#21262d" : "#238636",
            color: "white",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Compiling..." : "Run"}
        </button>
        <span style={{ fontSize: 12, color: "#8b949e" }}>
          provider: <code>deterministic-mock</code> (demo)
        </span>
      </div>

      <PromptShortcuts onPick={(p) => setNl(p.nl)} />

      {error && <ErrorBox error={error} />}
      {result && <ResultBox result={result} />}
    </div>
  );
}

function PromptShortcuts({ onPick }: { onPick: (p: PromptDef) => void }): JSX.Element {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 6 }}>
        Demo prompts (click to use):
      </div>
      <div data-testid="prompt-library" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {PROMPT_LIBRARY.map((p) => (
          <button
            key={p.nl}
            onClick={() => onPick(p)}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              borderRadius: 4,
              border: "1px solid #30363d",
              background: "#161b22",
              color: "#58a6ff",
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultBox({ result }: { result: RuleCompileResponse }): JSX.Element {
  return (
    <div
      data-testid="result-box"
      style={{ border: "1px solid #30363d", borderRadius: 6, padding: 16 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <section>
          <h3 style={{ marginTop: 0 }}>Compiled rule</h3>
          <dl style={{ fontSize: 13, margin: 0 }}>
            <Row k="id" v={result.rule.id} />
            <Row k="entity" v={result.rule.entity} />
            <Row k="severity" v={result.rule.severity} />
            <Row
              k="fields read"
              v={result.rule.fieldsRead.map((f) => `${f.entity}.${f.field}`).join(", ")}
            />
            <Row k="dry-run findings" v={String(result.dryRunFindings ?? 0)} highlight />
          </dl>
        </section>
        <section>
          <h3 style={{ marginTop: 0 }}>Provenance</h3>
          <dl style={{ fontSize: 13, margin: 0 }}>
            <Row k="provider" v={result.provenance.provider} />
            <Row k="model" v={result.provenance.model} />
            <Row k="latency" v={`${result.provenance.latencyMs} ms`} />
            <Row k="prompt sha256" v={result.provenance.promptHash.slice(0, 16) + "…"} mono />
            <Row k="response sha256" v={result.provenance.responseHash.slice(0, 16) + "…"} mono />
            <Row
              k="cost"
              v={
                result.provenance.costUsd === undefined
                  ? "–"
                  : `$${result.provenance.costUsd.toFixed(4)}`
              }
            />
          </dl>
        </section>
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  mono,
  highlight,
}: {
  k: string;
  v: string;
  mono?: boolean;
  highlight?: boolean;
}): JSX.Element {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        padding: "2px 0",
        borderBottom: "1px solid #21262d",
      }}
    >
      <dt style={{ color: "#8b949e" }}>{k}</dt>
      <dd
        style={{
          margin: 0,
          color: highlight ? "#3fb950" : "#e6edf3",
          fontFamily: mono ? "ui-monospace, monospace" : "inherit",
        }}
      >
        {v}
      </dd>
    </div>
  );
}

function ErrorBox({ error }: { error: CompileError }): JSX.Element {
  return (
    <div
      data-testid="error-box"
      style={{
        border: "1px solid #f85149",
        background: "#180609",
        color: "#f8a3a3",
        padding: 16,
        borderRadius: 6,
      }}
    >
      <strong>{error.error}</strong>
      {error.code && <span style={{ marginLeft: 8 }}>({error.code})</span>}
      {error.message && <div style={{ marginTop: 6 }}>{error.message}</div>}
    </div>
  );
}
