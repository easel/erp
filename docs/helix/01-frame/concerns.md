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
- demo-playwright (demo, ui)
- hugo-hextra (microsite)

## Area Labels

| Label | Applies to |
|-------|-----------|
| `all` | Every bead |
| `ui` | packages/web (frontend) |
| `api` | packages/server (Fastify + GraphQL Yoga) |
| `data` | Database migrations (graphile-migrate), PostgreSQL schema |
| `infra` | Kubernetes (kind locally, production), Helm charts |

## Project Overrides

### react-nextjs
- **Framework**: React 19 + Next.js 15 (App Router), TypeScript strict
- **Package**: `packages/web/` — workspace dependency on `@apogee/shared` for Zod schemas and types
- **State**: Server state via TanStack Query 5 (planned), client state via Zustand (planned)
- **Forms**: React Hook Form 7 + `@hookform/resolvers/zod` — Zod schemas from `@apogee/shared` are the single source of truth (ADR-010)
- **Tables**: TanStack Table 8 (headless) wrapped in `DataTable` component with server-side pagination, sort, filter, CSV export
- **Routing**: App Router with module-based layout: `/finance/...`, `/sales/...`, `/procurement/...`, `/crm/...`, `/compliance/...`, `/settings/...`
- **Current gap**: Components exist (RootLayout, ModuleSidebar, DataTable, EntitySwitcher, MoneyInput, etc.) but no pages wired. GraphQL schema lacks list/detail queries needed for master-detail views.

### ux-radix
- **Component strategy**: shadcn/ui + Radix Primitives + Tailwind CSS 4 (ADR-011) — shadcn components copied into project, not installed as a dependency
- **Current gap**: Tailwind CSS and shadcn/ui packages not yet installed; all current styling is inline CSS objects matching Tailwind's design token scale
- **Accessibility**: WCAG 2.1 AA target — Radix handles keyboard nav, focus management, ARIA attributes
- **Domain components**: MoneyInput (ISO 4217), ComplianceStatusBadge (pending/cleared/held), FiscalPeriodPicker (period status awareness), EntitySwitcher (Cmd+E, localStorage)
- **Color palette**: Finance (#3b82f6), Sales (#10b981), Procurement (#f59e0b), CRM (#8b5cf6), Compliance (#ef4444)

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
- **Reel test**: `tests/e2e/00-reel.spec.ts` — API-driven feature spec exercising all entity types and workflows (vendor creation, PO lifecycle, GL journal entries, compliance screening, entity switching). Will evolve to browser-driven UI walkthrough once pages are wired.
- **Helpers**: `tests/e2e/helpers/api.ts` — `graphql()`, `screenshotPage()`, seed constants
- **Run**: `bun run test:e2e` (headless) or `bun run test:e2e:headed` (browser visible)
- **Against Kind**: `E2E_BASE_URL=http://localhost:3100 bun run test:e2e`

### hugo-hextra
- **Site directory**: `website/` — Hugo Module system with `go.mod` pinning Hextra v0.12.1
- **Config**: `website/hugo.yaml` — Hextra theme, `enableGitInfo: true`, wide page width
- **Content structure**: Home (hextra-home layout), Docs (getting-started, concepts), Entity Catalog (per-module pages auto-synced from Zod schemas), API Reference
- **Entity catalog sync**: When entity schemas in `packages/shared/src/entity-schemas/` change, the corresponding `website/content/docs/entities/*.md` pages must be updated in the same pass
- **Build**: `hugo --gc --minify` from `website/` directory
- **Deployment**: GitHub Pages via GitHub Actions (planned)
- **Theme management**: Hugo Module (`go mod`) — not git submodules
