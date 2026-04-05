# Project Concerns

## Active Concerns
- typescript-bun (tech-stack)
- react-nextjs (tech-stack, ui)
- ux-radix (quality-attribute, ui)
- testing (quality-attribute)
- o11y-otel (observability)
- k8s-kind (infra)
- e2e-kind (testing)
- e2e-playwright (testing)

## Area Labels

| Label | Applies to |
|-------|-----------|
| `all` | Every bead |
| `ui` | packages/web (frontend) |
| `api` | packages/server (Fastify + GraphQL Yoga) |
| `data` | Database migrations (graphile-migrate), PostgreSQL schema |
| `infra` | Kubernetes (kind locally, production), Helm charts |

## Project Overrides

### typescript-bun
- **HTTP framework**: Fastify 5 + GraphQL Yoga (not raw `Bun.serve()`) — Fastify is Bun-compatible
- **Test framework**: `bun:test` (confirmed — do not switch to Vitest)
- **Migrations**: `graphile-migrate` via `bun run migrate`
- **Local infra**: Docker Compose for PostgreSQL + Redis during development (migration to kind cluster is tracked work)

### k8s-kind
- **Helm chart**: `deploy/helm/apogee` with `values.yaml`, `values-dev.yaml`, `values-prod.yaml`
- **PostgreSQL**: bitnami/postgresql chart dependency (`postgresql.enabled`)
- **Local dev**: kind cluster `apogee-demo` via `bun run demo`

### e2e-kind
- **Cluster name**: `apogee-demo` — NodePorts: API (3100→30000), Keycloak (8180→30080)
- **Lifecycle script**: `scripts/demo.ts` (TypeScript/Bun) — creates cluster, builds/loads images, deploys postgres/redis/keycloak, migrates, seeds, deploys app
- **Seed data**: `packages/server/src/seed.ts` — Orbital Dynamics Corp scenario with 20+ customers, 15+ vendors, 5 satellites, accounting journal entries. Deterministic UUIDs, `ON CONFLICT DO NOTHING`
- **Test user**: `demo@apogee.dev` / `apogee-demo`
- **Run**: `bun run demo` (stands up full stack and opens browser)

### e2e-playwright
- **Config**: `playwright.config.ts` — single Chromium project, `tests/e2e/` test dir
- **Base URL**: `E2E_BASE_URL` env var (defaults to `http://localhost:3000`; Kind demo uses `:3100`)
- **Server startup**: auto-starts the API server when `E2E_BASE_URL` is not set; skipped when running against Kind
- **Reel test**: `tests/e2e/00-reel.spec.ts` — sequential visual walkthrough of every module with screenshots; acts as a smoke test and demo artifact generator
- **Screenshot output**: `test-results/e2e-artifacts/` — named per scene (e.g., `reel-01-health.png`)
- **Helpers**: `tests/e2e/helpers/api.ts` — `graphql()`, `screenshotPage()`, seed constants
- **Run**: `bun run test:e2e` (headless) or `bun run test:e2e:headed` (browser visible)
- **Against Kind**: `E2E_BASE_URL=http://localhost:3100 bun run test:e2e`
