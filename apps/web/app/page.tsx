export default function HomePage() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>DataBridge</h1>
      <p style={{ maxWidth: 720, lineHeight: 1.6 }}>
        Read upstream student record systems (SITS, Banner, Workday, SJMS5),
        normalise into the HERM-aligned canonical model, validate against
        statutory profiles (HESA TDP), and stage migrations downstream.
      </p>
      <ul>
        <li>
          <a href="/adapters" style={{ color: "#58a6ff" }}>
            Source adapters
          </a>{" "}
          — six implementations of <code>SourceAdapter</code>.
        </li>
        <li>
          <a href="/profiles" style={{ color: "#58a6ff" }}>
            Target profiles
          </a>{" "}
          — HESA TDP and SITS.
        </li>
        <li>
          <a href="/audits" style={{ color: "#58a6ff" }}>
            Audit runs
          </a>{" "}
          — recent audits and per-finding detail.
        </li>
        <li>
          <a href="/query" style={{ color: "#58a6ff" }}>
            Query bar
          </a>{" "}
          — natural-language → rule → findings (Phase B demo).
        </li>
      </ul>
    </div>
  );
}
