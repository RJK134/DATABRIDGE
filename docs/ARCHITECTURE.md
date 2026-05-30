# DataBridge Architecture

## Deployment Topologies

### Tier 1 — SaaS (Recommended)

| Component      | Host                         |
| -------------- | ---------------------------- |
| Next.js 14 web | Vercel                       |
| Fastify API    | Railway / Fly.io             |
| Postgres 16    | Neon                         |
| Object store   | Cloudflare R2                |
| Identity       | Keycloak (DataBridge-hosted) |

### Tier 2 — Enterprise On-Premise

| Variant | Notes                                                       |
| ------- | ----------------------------------------------------------- |
| Azure   | AKS + Azure Database for PostgreSQL + Azure Blob + Entra ID |
| AWS     | ECS/EKS + RDS Aurora + S3 + Cognito                         |
| OCI     | OKE + Autonomous DB + Object Storage + OCI IAM              |

### Tier 3 — In-VPC Connector

For institutions that cannot expose Oracle credentials outside their network.
A lightweight Node pod runs inside the customer VPC, executes the SITS-Oracle
or Banner-Oracle adapter locally, redacts/profiles output, and pushes only
lineage + profiles to the DataBridge tenant over outbound mTLS.

## Component Responsibilities

### apps/api

- Fastify 4, Node 20, TypeScript
- Single ingress point for web UI and external clients
- OIDC auth via Keycloak (JWT validation)
- RBAC middleware (tenant-scoped roles)
- Structured logging via pino with PII redaction
- pg-boss for background job scheduling

### apps/web

- Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui
- Mapping Studio, Audit Console, Migration Cockpit, Lineage Explorer
- Server Components + Server Actions for data fetching
- Deployed to Vercel; calls API via internal URL

### packages/platform

- Pluggable interfaces: StorageAdapter, SecretsAdapter, IdentityAdapter,
  LlmAdapter, QueueAdapter, TelemetryAdapter
- PlatformConfigSchema (Zod, env-driven, validated at boot)

### packages/adapter-spec

- SourceAdapter and TargetAdapter TypeScript interfaces
- Zod schemas for SchemaDescriptor, CodeList, DictionaryEntry

### packages/rule-core

- Rule DSL evaluator
- Rule types: deterministic-sql, statistical, llm-judged, codelist-lookup
- Finding severity: INFO | WARN | ERROR | CRITICAL

### packages/dhp-core

- Data Health Picture metrics engine
- Snapshot worker (pg-boss job)
- UCISA benchmark overlay calculations
- Scorecard JSON generation for UI charts

### packages/canonical

- HERM v3.1 entity TypeScript types
- Zod validation schemas
- HESA Data Futures field mappings

### adapters/\*

Each adapter implements `SourceAdapter` from `packages/adapter-spec`.
See `docs/CONNECTORS.md` for per-adapter configuration.

### profiles/\*

Each profile package exports:

- `entities[]` — resource definitions with field metadata
- `codesets[]` — code-list snapshots
- `rules[]` — `AuditRule[]` array conforming to rule-core DSL

### migrations/\*

Each migration pair exports:

- `sourceProfileId` / `targetProfileId`
- `mappings[]` — field-level mapping definitions
- `transformFns` — transformation function registry
- `dryRun()` / `commit()` / `rollback()` lifecycle functions

## Data Flow

```
Source SRS
  ↓ SourceAdapter.streamRows()
  ↓ Ingestion Worker (pg-boss)
  ↓ RawRecord / RawField (append-only)
  ↓ Profiler → FieldProfile stats
  ↓ Audit Engine → AuditFinding
  ↓ Mapping Engine → CanonicalEntity
  ↓ LineageEdge (every transformation recorded)
  ↓ Export / Migration Engine
  ↓ Target SRS / CRM / HESA
```

## Security Constraints

- No PII in logs (pino redaction on `email`, `surname`, `forenames`, `dob`,
  `national_id`, `address_*`, `phone`, `nhs_number`, `passport_*`)
- No raw PII to LLMs (redaction pipeline before every agent call)
- Data residency: UK/EU tenancy by default; LLM calls routed to EU regions
- Right to erasure: person-keyed soft-deletes propagate via LineageEdge graph
- All secrets vault-mediated (never raw env vars in adapters)
