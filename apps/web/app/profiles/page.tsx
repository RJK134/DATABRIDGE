interface ProfileSummary {
  id: string;
  version: string;
  label: string;
  description?: string;
  entityCount: number;
  fieldCount: number;
  ruleCount: number;
}

async function fetchProfiles(): Promise<ProfileSummary[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${apiUrl}/profiles`, { cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { profiles: ProfileSummary[] };
    return body.profiles;
  } catch {
    return [];
  }
}

export default async function ProfilesPage() {
  const profiles = await fetchProfiles();
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Target profiles</h1>
      {profiles.length === 0 ? (
        <p>
          The API gateway is not reachable at{" "}
          <code>{process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}</code>.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {profiles.map((p) => (
            <div
              key={p.id}
              style={{
                border: "1px solid #30363d",
                borderRadius: 8,
                padding: 16,
                background: "#161b22",
              }}
            >
              <div style={{ fontSize: 12, color: "#8b949e", fontFamily: "monospace" }}>
                {p.id} · {p.version}
              </div>
              <h3 style={{ margin: "4px 0 8px" }}>{p.label}</h3>
              {p.description && (
                <p style={{ fontSize: 13, color: "#c9d1d9", marginTop: 0 }}>{p.description}</p>
              )}
              <div style={{ fontSize: 13, color: "#8b949e", marginTop: 8 }}>
                {p.entityCount} entities · {p.fieldCount} fields · {p.ruleCount} rules
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
