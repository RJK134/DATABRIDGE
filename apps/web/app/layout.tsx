import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "DataBridge",
  description: "Higher-education data integration platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0e1116",
          color: "#e6edf3",
          minHeight: "100vh",
        }}
      >
        <header
          style={{
            padding: "12px 24px",
            borderBottom: "1px solid #30363d",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 18 }}>DataBridge</div>
          <nav style={{ display: "flex", gap: 16, fontSize: 14 }}>
            <a href="/" style={{ color: "#58a6ff", textDecoration: "none" }}>
              Home
            </a>
            <a href="/adapters" style={{ color: "#58a6ff", textDecoration: "none" }}>
              Adapters
            </a>
            <a href="/profiles" style={{ color: "#58a6ff", textDecoration: "none" }}>
              Profiles
            </a>
            <a href="/audits" style={{ color: "#58a6ff", textDecoration: "none" }}>
              Audits
            </a>
            <a href="/query" style={{ color: "#58a6ff", textDecoration: "none" }}>
              Query bar
            </a>
          </nav>
        </header>
        <main style={{ padding: "24px" }}>{children}</main>
      </body>
    </html>
  );
}
