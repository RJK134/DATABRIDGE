interface AdapterSummary {
  id: string;
  displayName: string;
  preferredAuth: string;
  capabilities: {
    supportsIncremental: boolean;
    supportsSampling: boolean;
    supportsCodeLists: boolean;
    supportsDictionary: boolean;
  };
}

async function fetchAdapters(): Promise<AdapterSummary[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${apiUrl}/adapters`, { cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { adapters: AdapterSummary[] };
    return body.adapters;
  } catch {
    return [];
  }
}

export default async function AdaptersPage() {
  const adapters = await fetchAdapters();
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Source adapters</h1>
      {adapters.length === 0 ? (
        <p>
          The API gateway is not reachable at{" "}
          <code>{process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}</code>.
          Start <code>apps/api</code> in a separate shell.
        </p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 900 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #30363d" }}>
              <th style={{ padding: 8 }}>ID</th>
              <th style={{ padding: 8 }}>Display name</th>
              <th style={{ padding: 8 }}>Auth</th>
              <th style={{ padding: 8 }}>Capabilities</th>
            </tr>
          </thead>
          <tbody>
            {adapters.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #21262d" }}>
                <td style={{ padding: 8, fontFamily: "monospace" }}>{a.id}</td>
                <td style={{ padding: 8 }}>{a.displayName}</td>
                <td style={{ padding: 8 }}>{a.preferredAuth}</td>
                <td style={{ padding: 8, fontSize: 13, color: "#8b949e" }}>
                  {Object.entries(a.capabilities)
                    .filter(([, v]) => v)
                    .map(([k]) => k.replace(/^supports/, ""))
                    .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
