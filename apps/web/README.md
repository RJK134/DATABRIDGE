# @databridge/web

Next.js 14 (App Router) front-end for DataBridge.

## Routes

- `/` — landing page
- `/adapters` — source-adapter catalogue (reads from `apps/api` `/adapters`)
- `/profiles` — target-profile catalogue (reads from `apps/api` `/profiles`)

## Development

```bash
# In one shell:
pnpm --filter @databridge/api dev    # http://localhost:3001

# In another shell:
pnpm --filter @databridge/web dev    # http://localhost:3000
```

The web app reads `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`)
when fetching adapter / profile data.

## Phase B scope

Phase B delivers the scaffold (App Router, layout, three pages, API fetches).
Mapping studio, audit dashboards, and authentication land in Phase D+.
