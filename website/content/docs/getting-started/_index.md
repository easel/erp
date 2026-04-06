---
title: Getting Started
weight: 1
---

Get Apogee running locally in under 5 minutes.

## Prerequisites

- [Bun](https://bun.sh/) v1.2+
- [Docker](https://docs.docker.com/get-docker/)
- [Kind](https://kind.sigs.k8s.io/) v0.20+
- [kubectl](https://kubernetes.io/docs/tasks/tools/)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/apogee-erp/apogee.git
cd apogee

# Install dependencies
bun install

# Start the demo cluster (Kind + Postgres + seed data)
bun run demo
```

This creates a Kind cluster named `apogee-demo` with:
- PostgreSQL database with migrations applied
- Seed data for all entity types (vendors, customers, products, accounts, etc.)
- GraphQL API server on `http://localhost:3100/graphql`

## Run the Web UI

In a separate terminal:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3100 PORT=3200 bun run --filter '@apogee/web' dev
```

Open `http://localhost:3200` to see the dashboard.

## Run Tests

```bash
# Unit and integration tests
bun test

# E2E API tests (requires demo cluster)
E2E_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/00-reel.spec.ts

# E2E UI tests (requires demo cluster + web dev server)
E2E_BASE_URL=http://localhost:3200 npx playwright test tests/e2e/00-ui-reel.spec.ts
```

## Project Structure

```
apogee/
├── packages/
│   ├── server/     # GraphQL API (Yoga + Pothos)
│   ├── shared/     # Zod schemas, types, entity definitions
│   └── web/        # Next.js 15 frontend (App Router)
├── migrations/     # PostgreSQL migrations (Graphile Migrate)
├── k8s/            # Kubernetes manifests for Kind demo
├── tests/e2e/      # Playwright end-to-end tests
└── website/        # This documentation site (Hugo + Hextra)
```
