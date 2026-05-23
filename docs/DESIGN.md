# SJMS DataBridge — Architecture & Design

> Full design document. See repository root `README.md` for quick start.
> Maintained by Future Horizons Education · Document version 1.0 · May 2026

This file contains the complete system design. For the full 87,000-character
master document, see the attached `DESIGN.md` in the project knowledge base.

## Contents

1. Executive Summary
2. Context & Drivers
3. Product Principles
4. System Architecture
5. Pluggable Source Adapter Specification
6. Canonical HERM Data Model
7. Audit Rule Engine
8. AI Agent Runtime
9. Data Health Picture
10. Migration Engine
11. Integration Hub (CRM connectors)
12. Security & Compliance
13. Deployment Matrix
14. Phase Build Plan (0–6)

## Key Design Decisions

- **HERM v3.1** canonical model (CAUDIT CC BY-NC-SA) as the single source of truth for downstream consumers
- **pg-boss** for background jobs (no Redis dependency)
- **Neon Postgres** branching for safe schema migrations
- **Dual-vendor LLM** (Anthropic primary, OpenAI fallback) with EU-region routing
- **In-VPC Connector** escape valve for locked-down Oracle environments
- **69 audit rules** across 13 families, all with `ucisa_benchmark_ref`
- **8 legacy-scar rules** (F12 family) — commercially differentiating capability
- **Human-in-the-loop** for every write — DataBridge proposes, humans approve
