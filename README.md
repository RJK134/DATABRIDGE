# SJMS DataBridge

**Standalone HE data audit, cleansing, migration and integration platform**

Future Horizons Education · May 2026

---

## What is DataBridge?

DataBridge sits *next to* your Student Record System (SITS, Banner, Workday, SJMS-5) and provides:

- **Audit Engine** — 69 rules across 13 families covering HESA Data Futures, UCISA benchmarks, and SITS-specific integrity checks
- **Data Health Picture (DHP)** — institution-level quality scorecards with UCISA benchmark overlays
- **AI Agents** — Anomaly Detector, Schema Mapper, Cleansing Proposer, NL Query (human-in-the-loop, PII-safe)
- **Migration Engine** — one-shot bulk migration with full row-level lineage, dry-runs, and staged commit/rollback
- **Integration Hub** — canonical HERM REST/GraphQL API for Salesforce EDU, Dynamics 365 EDU, HubSpot
- **Mapping Studio** — visual source→canonical field mapper with AI-assisted suggestions

## Monorepo Structure

```
databridge/
├── apps/
│   ├── api/          # Fastify API gateway (Node 20)
│   └── web/          # Next.js 14 control plane
├── packages/
│   ├── platform/     # Pluggable adapter interfaces & platform config
│   ├── adapter-spec/ # SourceAdapter & TargetAdapter TypeScript interfaces
│   ├── rule-core/    # Rule DSL evaluator engine
│   ├── dhp-core/     # Data Health Picture metrics engine
│   └── canonical/    # HERM canonical entity types
├── adapters/
│   ├── sits-oracle/  # SITS Oracle direct-read adapter
│   ├── sits-api/     # SITS Web Services adapter
│   ├── sits-file/    # SITS CSV/XML file adapter
│   ├── banner-ethos/ # Ellucian Ethos REST adapter
│   ├── banner-oracle/# Banner Oracle direct-read adapter
│   ├── workday-raas/ # Workday RaaS adapter
│   └── sjms5/        # SJMS-5 Prisma/Postgres adapter
├── profiles/
│   ├── profile-sits/ # SITS entity definitions, codesets, 35+ rules
│   └── profile-hesa-tdp/ # HESA Data Futures profile, 42+ rules
├── migrations/
│   └── sits-to-hesa-tdp/ # SITS → HESA Data Platform migration pair
└── docs/
    ├── DESIGN.md
    ├── ARCHITECTURE.md
    ├── AUDIT_RULES.md
    └── CONNECTORS.md
```

## Quick Start

```bash
# Prerequisites: Node 20+, pnpm 9+
npm install -g pnpm@9

# Install all workspace packages
pnpm install

# Copy env template
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL and other required values

# Start development
pnpm dev

# Run tests
pnpm test

# Type check all packages
pnpm typecheck

# Build all packages
pnpm build
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Design Document](docs/DESIGN.md)
- [Audit Rules Catalogue](docs/AUDIT_RULES.md)
- [Connectors Guide](docs/CONNECTORS.md)

## Deployment

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for deployment topologies:
- **Vercel (web) + Railway (API) + Neon (DB)** — recommended SaaS
- **Azure / AWS / OCI** — enterprise on-premise
- **Cloud SITS in-VPC connector** — for locked-down Oracle environments

## License

Proprietary — Future Horizons Education Ltd. All rights reserved.
