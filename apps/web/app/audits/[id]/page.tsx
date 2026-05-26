/**
 * /audits/[id] — detail view.
 *
 * Renders a single audit's metadata, summary counters, and findings list.
 * The findings panel is grouped by severity since that's the most useful
 * cut for triage; each finding shows its rule id, subject id, message,
 * and serialised evidence.
 */

import { notFound } from "next/navigation";

interface AuditFinding {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: "CRITICAL" | "ERROR" | "WARN" | "INFO";
  entityType: string;
  subjectId: string;
  message?: string;
  evidence?: Record<string, unknown>;
  status: string;
  detectedAt: string;
}

interface AuditReport {
  auditId: string;
  tenantId: string;
  startedAt: string;
  completedAt: string;
  rulesTotal: number;
  rulesSql: number;
  rulesFn: number;
  rowsScanned: number;
  findingsTotal: number;
  findingsBySeverity: Record<string, number>;
  findings: AuditFinding[];
  warnings: string[];
}

interface AuditRecord {
  auditId: string;
  tenantId: string;
  profileId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  report?: AuditReport;
  error?: string;
}

async function fetchAudit(id: string): Promise<AuditRecord | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${apiUrl}/audits/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as AuditRecord;
  } catch {
    return null;
  }
}

const SEVERITY_ORDER: AuditFinding["severity"][] = [
  "CRITICAL",
  "ERROR",
  "WARN",
  "INFO",
];

function severityColour(s: AuditFinding["severity"]): string {
  switch (s) {
    case "CRITICAL":
      return "#f85149";
    case "ERROR":
      return "#f85149";
    case "WARN":
      return "#d29922";
    case "INFO":
    default:
      return "#58a6ff";
  }
}

export default async function AuditDetailPage({
  params,
}: {
  // Next 15: dynamic-route params are async.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const audit = await fetchAudit(id);
  if (!audit) notFound();

  const report = audit.report;

  // Group findings by severity for triage-friendly display.
  const findingsBySev: Record<string, AuditFinding[]> = {};
  if (report) {
    for (const f of report.findings) {
      const bucket = findingsBySev[f.severity] ?? [];
      bucket.push(f);
      findingsBySev[f.severity] = bucket;
    }
  }

  return (
    <div>
      <a
        href="/audits"
        style={{ color: "#58a6ff", textDecoration: "none", fontSize: 13 }}
      >
        ← All audits
      </a>

      <h1 style={{ marginTop: 8 }}>
        Audit{" "}
        <span style={{ fontFamily: "monospace", fontSize: 22, color: "#8b949e" }}>
          {audit.auditId.slice(0, 8)}…
        </span>
      </h1>

      <Card>
        <KV k="Tenant" v={<code>{audit.tenantId}</code>} />
        <KV k="Profile" v={<code>{audit.profileId}</code>} />
        <KV
          k="Status"
          v={
            <span
              style={{
                color:
                  audit.status === "succeeded"
                    ? "#3fb950"
                    : audit.status === "failed" ||
                        audit.status === "cancelled"
                      ? "#f85149"
                      : "#d29922",
                fontWeight: 600,
              }}
            >
              {audit.status}
            </span>
          }
        />
        <KV k="Created" v={new Date(audit.createdAt).toLocaleString()} />
        <KV k="Updated" v={new Date(audit.updatedAt).toLocaleString()} />
        {audit.error && (
          <KV
            k="Error"
            v={
              <span style={{ color: "#f85149", fontFamily: "monospace" }}>
                {audit.error}
              </span>
            }
          />
        )}
      </Card>

      {report && (
        <>
          <h2 style={{ marginTop: 24 }}>Summary</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <Stat label="Rules" value={report.rulesTotal} />
            <Stat label="SQL rules" value={report.rulesSql} />
            <Stat label="Fn rules" value={report.rulesFn} />
            <Stat label="Rows scanned" value={report.rowsScanned} />
            <Stat
              label="Findings"
              value={report.findingsTotal}
              colour={report.findingsTotal > 0 ? "#f85149" : "#3fb950"}
            />
            <Stat
              label="Duration"
              value={`${Math.max(
                0,
                new Date(report.completedAt).getTime() -
                  new Date(report.startedAt).getTime(),
              )} ms`}
            />
          </div>

          {report.warnings.length > 0 && (
            <>
              <h2 style={{ marginTop: 24 }}>Warnings</h2>
              <Card>
                <ul style={{ margin: 0, paddingLeft: 20, color: "#d29922" }}>
                  {report.warnings.map((w, i) => (
                    <li key={i} style={{ fontFamily: "monospace", fontSize: 13 }}>
                      {w}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}

          <h2 style={{ marginTop: 24 }}>Findings</h2>
          {report.findings.length === 0 ? (
            <Card>
              <span style={{ color: "#3fb950" }}>
                Clean run — no findings emitted.
              </span>
            </Card>
          ) : (
            SEVERITY_ORDER.map((sev) => {
              const bucket = findingsBySev[sev] ?? [];
              if (bucket.length === 0) return null;
              return (
                <div key={sev} style={{ marginBottom: 16 }}>
                  <h3
                    style={{
                      color: severityColour(sev),
                      marginBottom: 8,
                    }}
                  >
                    {sev} · {bucket.length}
                  </h3>
                  <div
                    style={{
                      border: "1px solid #30363d",
                      borderRadius: 8,
                      background: "#161b22",
                      overflow: "hidden",
                    }}
                  >
                    {bucket.map((f, idx) => (
                      <div
                        key={f.id}
                        style={{
                          padding: 12,
                          borderTop:
                            idx === 0 ? "none" : "1px solid #30363d",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <code
                            style={{
                              fontSize: 12,
                              color: "#8b949e",
                            }}
                          >
                            {f.ruleId} · {f.entityType}:{f.subjectId}
                          </code>
                          <span
                            style={{ fontSize: 12, color: "#8b949e" }}
                          >
                            {new Date(f.detectedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div style={{ marginTop: 4, color: "#c9d1d9" }}>
                          {f.message ?? f.ruleName}
                        </div>
                        {f.evidence && Object.keys(f.evidence).length > 0 && (
                          <pre
                            style={{
                              marginTop: 6,
                              padding: 8,
                              background: "#0d1117",
                              borderRadius: 4,
                              fontSize: 12,
                              color: "#c9d1d9",
                              overflow: "auto",
                            }}
                          >
                            {JSON.stringify(f.evidence, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid #30363d",
        borderRadius: 8,
        background: "#161b22",
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
      <span style={{ width: 100, color: "#8b949e", fontSize: 13 }}>{k}</span>
      <span style={{ fontSize: 14 }}>{v}</span>
    </div>
  );
}

function Stat({
  label,
  value,
  colour,
}: {
  label: string;
  value: string | number;
  colour?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #30363d",
        borderRadius: 8,
        background: "#161b22",
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: colour ?? "#e6edf3" }}>
        {value}
      </div>
    </div>
  );
}
