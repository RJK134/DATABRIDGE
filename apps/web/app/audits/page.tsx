/**
 * /audits — list view.
 *
 * Reads GET /audits from the API gateway and renders a tight table of
 * recent audit runs. Status colour-codes the row so the eye can sweep for
 * failures. Each row links to /audits/[id] for the full report.
 */

interface AuditRecord {
  auditId: string;
  tenantId: string;
  profileId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  report?: {
    findingsTotal: number;
    findingsBySeverity: Record<string, number>;
    rulesTotal: number;
    rowsScanned: number;
  };
  error?: string;
}

async function fetchAudits(): Promise<AuditRecord[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${apiUrl}/audits`, { cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { audits: AuditRecord[] };
    return body.audits;
  } catch {
    return [];
  }
}

function statusColour(status: AuditRecord["status"]): string {
  switch (status) {
    case "succeeded":
      return "#3fb950";
    case "failed":
      return "#f85149";
    case "cancelled":
      return "#f85149";
    case "running":
      return "#d29922";
    case "queued":
    default:
      return "#8b949e";
  }
}

export default async function AuditsPage() {
  const audits = await fetchAudits();
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Audit runs</h1>

      {audits.length === 0 ? (
        <div
          style={{
            border: "1px solid #30363d",
            borderRadius: 8,
            padding: 16,
            background: "#161b22",
            color: "#c9d1d9",
          }}
        >
          <p style={{ marginTop: 0 }}>No audits to show yet.</p>
          <p style={{ fontSize: 13, color: "#8b949e", marginBottom: 0 }}>
            Either the API gateway at <code>{apiBase}</code> is not reachable,
            or no audits have been triggered. Use{" "}
            <code>POST {apiBase}/audits/run</code> with{" "}
            <code>{`{ profileId, tenantId, adapterId?, resourceMap? }`}</code>{" "}
            to create one.
          </p>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid #30363d",
            borderRadius: 8,
            overflow: "hidden",
            background: "#161b22",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
              color: "#c9d1d9",
            }}
          >
            <thead>
              <tr style={{ background: "#0d1117", textAlign: "left" }}>
                <th style={th}>Audit</th>
                <th style={th}>Profile</th>
                <th style={th}>Tenant</th>
                <th style={th}>Status</th>
                <th style={th}>Findings</th>
                <th style={th}>Rows</th>
                <th style={th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => (
                <tr
                  key={a.auditId}
                  style={{ borderTop: "1px solid #30363d" }}
                >
                  <td style={td}>
                    <a
                      href={`/audits/${a.auditId}`}
                      style={{
                        color: "#58a6ff",
                        textDecoration: "none",
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                    >
                      {a.auditId.slice(0, 8)}…
                    </a>
                  </td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 12 }}>
                    {a.profileId}
                  </td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 12 }}>
                    {a.tenantId}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        color: statusColour(a.status),
                        fontWeight: 600,
                      }}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td style={td}>
                    {a.report ? a.report.findingsTotal : "—"}
                  </td>
                  <td style={td}>
                    {a.report ? a.report.rowsScanned : "—"}
                  </td>
                  <td style={{ ...td, color: "#8b949e", fontSize: 12 }}>
                    {new Date(a.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 600,
  color: "#8b949e",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const td: React.CSSProperties = {
  padding: "10px 14px",
  verticalAlign: "top",
};
