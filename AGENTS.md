# AGENTS.md — Apogee

## Project Overview

Apogee is an ERP system for satellite operators. Monorepo with Bun workspaces.

## Tooling

| Tool | Purpose | Command |
|------|---------|---------|
| **Bun** | Runtime & package manager | `bun install`, `bun run <script>` |
| **Biome** | Linting & formatting | `bun run lint`, `bun run lint:fix` |
| **TypeScript** | Type checking (project refs) | `bun run typecheck` |
| **graphile-migrate** | Database migrations | `bun run migrate` |
| **Docker Compose** | Local PostgreSQL + Redis | `docker compose up -d` |
| **ddx bead** | Issue tracker (JSONL) | `ddx bead list`, `ddx bead create`, `ddx bead show <id>` |

## Workspace Packages

- `packages/shared` — Zod schemas, types, value objects (zero deps)
- `packages/server` — Fastify 5 + GraphQL Yoga + Pothos API server
- `packages/web` — Frontend (placeholder)

## Key Commands

```bash
bun test                    # Run all tests (bun:test)
bun run typecheck           # TypeScript check (per-package tsc --noEmit)
bun run lint                # Biome lint + format check
bun run lint:fix            # Auto-fix lint/format issues
bun run migrate             # Run graphile-migrate migrations
docker compose up -d        # Start PostgreSQL + Redis
```

## Code Conventions

- **Indent style:** tabs (Biome enforced)
- **Line width:** 100 (Biome enforced)
- **Strict TS:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **Module system:** ESNext modules, bundler resolution
- **Imports:** Use `@apogee/shared`, `@apogee/server` workspace aliases
- **No `any`:** TypeScript strict mode; avoid `any` types

## Verification Before Commit

Run all three: `bun test && bun run typecheck && bun run lint`

## Governing Specs

Architecture and design docs are in `docs/helix/02-design/solution-designs/`:
- `SD-001-system-architecture.md` — System architecture
- `SD-002-data-model.md` — Data model
- `SD-003-phase1-implementation-plan.md` — Phase 1 work packages
