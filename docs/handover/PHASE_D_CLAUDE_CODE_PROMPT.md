# Claude Code Handover Prompt — Phase D (Enterprise Ops)

**Copy everything below the line into Claude Code as a single message.**

---

You are completing **Phase D of the DATABRIDGE delivery plan** — enterprise ops. Read `docs/build-history/00_BUILD_HISTORY.md` and `docs/build-history/02_REVISED_DELIVERY_PLAN.md` §D first.

## Repo state at start

- Branch off `main` at v1.6.0 tag (after Phase HESA-DF merges)
- Create branch `feat/phase-d-enterprise-ops`
- Git user: `Freddie Finn <finnfreddie51@gmail.com>`
- Remote `rjk134` → `https://github.com/RJK134/DATABRIDGE.git`

## Scope

### D1 — RBAC + multi-tenancy + SSO (2 weeks)

- Extend `apps/api` with role-based access control: `viewer`, `auditor`, `mapper`, `migrator`, `admin`
- Per-surface and per-finding-class permissions
- Tenant isolation via Postgres schema-per-tenant; tenant ID propagated through every adapter call
- SSO: SAML + OIDC. Test against Azure AD, Okta, Google Workspace
- Tamper-evident audit log: every rule run, waiver, migration trigger emitted as structured event
- ≥ 60 tests across rbac, tenancy, sso, audit-log

### D2 — Observability (1.5 weeks)

- OpenTelemetry traces + metrics across api, cli, migration-runner
- Prometheus `/metrics` endpoint on `apps/api`
- Grafana dashboard pack shipped as JSON in `ops/grafana/`
- SLO definitions documented in `ops/slos.md`
- ≥ 30 tests

### D3 — Packaging (1.5 weeks)

- Helm chart at `ops/helm/databridge/` — single chart deploys api + web + worker + postgres
- Terraform modules: `ops/terraform/azure/` and `ops/terraform/oci/`
- Multi-arch Docker images, signed with cosign, SBOM attached
- Offline install bundle for air-gapped university environments
- Documented install procedure for each target

### D4 — Compliance evidence (1 week + external procurement)

- SOC 2 control mappings documented (not certification — evidence trail)
- DPIA template, UK-specific, GDPR-aligned, with HE-typical data flows pre-filled
- ISO 27001 control mapping
- Engage external penetration-test firm; one round before phase exit (budget ~£8-12k)
- Pen-test report committed to `docs/compliance/pentest-2026.md` (redact sensitive findings if needed)

## Process

- One commit per D-workstream
- `pnpm -r typecheck && pnpm -r build && pnpm -r test` clean after each
- Target: +120 tests
- PR title: `feat(phase-d): enterprise ops — RBAC + multi-tenancy + SSO + observability + packaging + compliance evidence`
- PR body includes: install runbook for Azure tenant via Helm + SSO config example, full RBAC permission matrix, SLO definitions table
- Push and open PR via `gh` CLI

## Out of scope

- Actual SOC 2 / ISO 27001 certification (evidence trail only)
- HESA streams beyond Student (Phase F)
- UCAS/Jisc/SLC/TEF connectors (Phase E)

## Definition of done

- A university IT department can read the docs, deploy DATABRIDGE in their Azure tenant via Helm, configure SSO against their Azure AD, and start running audits — without bespoke engineering support
- `PHASE_D_BUILD_LOG.md` committed
- PR URL returned

Work autonomously.
