# System Architecture: Apogee — Phase 1

**Authority Level:** 4 (Design)
**Status:** Draft
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md), [FEAT-009](../../01-frame/features/FEAT-009-platform-infrastructure.md)

---

## 1. Architecture Overview

> **Scope.** This document describes the Phase 1 architecture covering the modules enumerated below (Platform, Finance, Sales, Procurement, CRM, Logistics, Export Control). Phase 2 modules — Orbital Asset Management, Program Management, and advanced features — will extend this architecture but are not detailed here.

Apogee follows a layered, modular monolith architecture. All modules run in a single deployable unit with well-defined internal boundaries, shared infrastructure services, and an internal event bus for cross-module communication. This approach avoids the operational complexity of microservices for self-hosted deployments while maintaining the option to extract modules into separate services if scaling demands it later.

The system is organized into four primary layers: API, Service, Domain, and Data. Cross-cutting concerns (authentication, authorization, auditing, compliance, workflow) are implemented as platform services consumed by all modules through internal interfaces.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │   React 19 / Next.js 15 (App Router)                       │    │
│  │   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │    │
│  │   │ Finance  │ │  Sales   │ │   CRM    │ │ Procure  │ ... │    │
│  └───┴──────────┴─┴──────────┴─┴──────────┴─┴──────────┴─────┘    │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ HTTPS (TLS 1.3)
┌─────────────────────────▼───────────────────────────────────────────┐
│                        API LAYER                                    │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐    │
│  │  REST (Fastify) │  │ GraphQL (Yoga  │  │ Auth Middleware    │    │
│  │  OpenAPI 3.1    │  │  + Pothos)     │  │ (OIDC/SAML/JWT)   │    │
│  └────────────────┘  └────────────────┘  └────────────────────┘    │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Rate Limiting · Request Validation · RBAC Enforcement      │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────┐
│                      SERVICE LAYER                                  │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐          │
│  │ Finance   │ │ Sales     │ │ Procure   │ │ CRM       │          │
│  │ Service   │ │ Service   │ │ Service   │ │ Service   │          │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘          │
│  ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐          │
│  │ Export    │ │ Logistics │ │ Audit     │ │ Workflow  │          │
│  │ Control   │ │ Service   │ │ Service   │ │ Engine    │          │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘          │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │            Internal Event Bus (pg-listen / in-process)     │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────┐
│                       DOMAIN LAYER                                  │
│  Entity Models · Business Rules · Validation · Domain Events        │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────┐
│                        DATA LAYER                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐    │
│  │  PostgreSQL 16 │  │  Redis 7       │  │ S3-Compatible      │    │
│  │  (Primary +    │  │  (optional,    │  │ Object Store       │    │
│  │   Read Replicas│  │   recommended) │  │ (Documents,        │    │
│  │   Partitioned) │  │  Cache,        │  │  Attachments)      │    │
│  │                │  │  Sessions,     │  │                    │    │
│  │                │  │  Rate Limits   │  │                    │    │
│  └────────────────┘  └────────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**
- **Modular monolith, not microservices.** Self-hosted deployments need operational simplicity. A single process with internal module boundaries is easier to deploy, monitor, and debug than a distributed system. Module boundaries are enforced at the code level through package visibility and dependency rules.
- **PostgreSQL as the primary store for everything.** No mandatory Redis or message broker for core operations (Constraint C5). Redis is used for caching and rate limiting but the system functions without it. Background processing uses PostgreSQL-backed job queues (Graphile Worker) so core functions operate without external dependencies.
- **Compliance is infrastructure, not a module feature.** Export control checks are wired into the service layer as middleware that cannot be bypassed. Every transaction-creating operation passes through compliance gates before persistence.

---

## 2. Technology Stack

### Runtime & Language

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | **Bun** (Node.js fallback) | Single-binary deployment simplifies air-gapped installs, native TypeScript execution without transpilation, built-in SQLite for local-first client state, built-in test runner and bundler. Node.js 22 LTS retained as fallback runtime — CI tests run on both. See ADR-009. |
| Language | **TypeScript 5.x (strict mode)** | `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Financial software demands maximum type safety. Shared types between frontend and backend eliminate an entire class of integration bugs |

### Backend

| Component | Choice | Rationale |
|-----------|--------|-----------|
| HTTP Framework | **Fastify 5** | 2-3x faster than Express with comparable ecosystem. Built-in JSON schema validation, plugin architecture maps cleanly to module boundaries, first-class TypeScript support. NestJS adds unnecessary abstraction layers and decorator magic that obscure control flow in financial code where explicitness matters. Express is too minimal and lacks built-in validation |
| GraphQL Server | **GraphQL Yoga 5 + Pothos** | Yoga is Envelop-based (plugin ecosystem for auth, caching, tracing). Pothos provides code-first schema construction with full TypeScript inference — no code generation step, schemas are defined alongside resolvers. Superior DX over schema-first approaches for a system with hundreds of entity types |
| ORM / Query Builder | **Kysely 0.27+** | Type-safe SQL query builder, not a full ORM. Financial queries (multi-currency consolidation, intercompany elimination, aging reports, trial balance) require precise SQL control that ORMs like Prisma and TypeORM abstract away. Kysely generates SQL predictably, supports complex joins, CTEs, window functions, and raw SQL escape hatches. Drizzle is comparable but Kysely has stronger TypeScript inference for complex query composition. Prisma's query engine adds a binary dependency and its query API cannot express the financial SQL this system needs without dropping to raw queries constantly |
| Validation | **Zod 3** | Runtime schema validation with TypeScript type inference. Shared between API input validation, domain model validation, and frontend form validation. Single source of truth for data shapes |
| Job Queue | **Graphile Worker 0.16+** | PostgreSQL-backed job queue — no external broker required (Constraint C5). LISTEN/NOTIFY for near-instant job pickup, transactional job creation (enqueue a job in the same transaction as the data change), cron-like recurring jobs for screening list updates and report generation. Scales to thousands of jobs/second which exceeds ERP requirements |
| Authentication | **passport.js** (SAML strategy + OIDC strategy) + custom JWT session management | Mature, well-audited SAML 2.0 and OIDC implementations. Custom session layer on top for MFA enforcement and session management per PLT-US-005 |
| API Documentation | **@fastify/swagger + @fastify/swagger-ui** | Auto-generated OpenAPI 3.1 specs from Fastify route schemas. Zero drift between implementation and documentation |

### Frontend

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | **React 19 + Next.js 15 (App Router)** | Server components for data-heavy reporting pages, client components for interactive forms. App Router provides layouts that map to ERP navigation patterns (sidebar + tabbed content). Static export capability for air-gapped deployments |
| UI Components | **shadcn/ui + Radix Primitives + Tailwind CSS 4** | shadcn/ui provides high-quality, accessible components that are copied into the project (not a dependency). Full control over styling and behavior. Radix handles complex primitives (combobox, data table, date picker) with correct ARIA. Tailwind provides consistent design tokens without CSS architecture debates. For data-heavy ERP screens, this approach is superior to opinionated component libraries like Ant Design or MUI which fight back when you need financial-specific table behavior |
| Data Tables | **TanStack Table 8** | Headless table with sorting, filtering, grouping, column resizing, virtualization for 10K+ row datasets. The ERP's most used component — must handle financial data grids with cell-level formatting, inline editing, and drill-down |
| State Management | **TanStack Query 5** (server state) + **Zustand** (client state) | TanStack Query handles API caching, optimistic updates, and background refetching. Zustand handles UI-only state (selected entity context, open panels). No Redux — its ceremony is unnecessary when server state is handled by TanStack Query |
| Forms | **React Hook Form + Zod** | Complex ERP forms (journal entries with N line items, POs with dynamic lines, multi-step quote builders) need performant uncontrolled forms. Zod schemas shared with backend validation |
| Charts | **Recharts** | Financial dashboards, pipeline charts, budget-vs-actual. Declarative, React-native, handles the chart types ERP needs (bar, line, area, pie, waterfall) |
| i18n | **next-intl** | Server and client component translation, ICU message format for plurals and number/date formatting. Locale-aware formatting required by PLT-US-071 |

### Database & Infrastructure

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Database | **PostgreSQL 16** | Row-level security for multi-entity isolation, JSONB for flexible metadata (custom fields, audit snapshots), partitioning for time-series audit data, full-text search via `tsvector`/GIN indexes. The sole required database per PLT-005 |
| Full-Text Search | **PostgreSQL built-in (tsvector + GIN indexes)** | No Elasticsearch dependency. PostgreSQL full-text search handles entity search (customers, vendors, products, contacts) at ERP scale. For 1M+ SKUs, GIN indexes on tsvector columns provide sub-second search. Weighted search across multiple fields (name > description > SKU) is natively supported. If search requirements grow beyond PostgreSQL capabilities in Phase 3+, pg_search or Meilisearch can be added as an optional enhancement |
| Cache | **Redis 7** (optional, recommended) | Session store, rate limiting counters, frequently-accessed reference data (exchange rates, screening list hashes, entity configuration). System functions without Redis by falling back to in-process LRU cache and PostgreSQL-backed sessions, but Redis significantly improves performance for multi-instance deployments |
| Message Queue | **Graphile Worker** (PostgreSQL-backed) | See job queue above. For self-hosted deployments that need to work without external dependencies, a PostgreSQL-backed queue is the right default. For operators who want higher throughput async processing (Phase 3+), NATS can be added as an optional event transport |
| Object Storage | **S3-compatible** (MinIO for self-hosted) | Documents, attachments, generated reports, contract PDFs, end-use certificates. MinIO provides S3 API compatibility for air-gapped deployments. PostgreSQL large objects as fallback for minimal deployments |
| Migrations | **graphile-migrate** | Plain SQL migrations with current.sql for development workflow. Complements Graphile Worker. Alternative: Kysely's built-in migrations if the team prefers TypeScript-defined migrations |

### Testing

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Unit / Integration | **bun test** | Bun's built-in test runner (`bun test`) — Jest-compatible API, zero-config, runs TypeScript natively without transpilation. Eliminates a test framework dependency per ADR-009's single-binary approach. Module-level integration tests run against real PostgreSQL (via testcontainers) |
| E2E | **Playwright** | Cross-browser testing for ERP UI workflows. Critical for financial forms where a misplaced decimal has real consequences |
| API Testing | **bun test + Fastify `inject()`** | Request-level testing of REST and GraphQL endpoints using Fastify's built-in light-weight injection (no HTTP overhead, no external dependency). Auth context passed via headers in the injected request |
| Compliance Testing | **Custom test harness** | Known-good and known-bad transaction scenarios for export control validation. Screening list test fixtures with expected match/no-match outcomes. This is not optional — it is a P0 deliverable per Risk R1 |

---

## 3. System Layers

### 3.1 API Layer

The API layer is the sole entry point for all client interactions. No direct database access from the frontend or external systems.

**REST API (Fastify)**
- Every module exposes REST endpoints following OpenAPI 3.1 specification
- CRUD operations use standard HTTP verbs and status codes
- Bulk operations (e.g., batch approve POs, bulk import products) use POST with array payloads
- Cursor-based pagination by default (offset pagination available for simpler use cases)
- Filtering via query parameters with a structured syntax: `?filter[status]=active&filter[amount.gte]=1000`
- All request bodies validated against Zod schemas at the route level before reaching service code
- Response envelopes include metadata: `{ data, pagination, links }`

**GraphQL API (Yoga + Pothos)**
- Single `/graphql` endpoint serving a unified schema
- Used primarily for: complex cross-module queries (e.g., "orders with their line items, compliance screening results, and shipment status"), reporting queries, and dashboard data aggregation
- Resolvers delegate to the same service layer as REST — no separate business logic
- DataLoader pattern for N+1 prevention on all relationship fields
- Query depth limiting (max depth: 10) and query complexity analysis to prevent resource exhaustion
- Persisted queries in production to prevent arbitrary query injection

**Authentication Middleware**
- All requests (REST and GraphQL) pass through authentication middleware
- Bearer token (JWT) for API access; session cookie for browser access
- SAML 2.0 / OIDC redirect flow for browser-based SSO
- API key authentication for service-to-service integrations
- MFA verification status is encoded in the session/token; ITAR-compartmented endpoints require MFA-verified sessions

**Request Pipeline**
```
Request
  → TLS termination
  → Rate limiter (Redis-backed or in-process)
  → Authentication (JWT verify / session lookup)
  → RBAC check (permission + entity scope + ITAR compartment)
  → Request validation (Zod schema)
  → Route handler (delegates to service layer)
  → Response serialization
  → Audit log emission (async, non-blocking)
```

### 3.2 Service Layer

The service layer contains all business logic. Each module has its own set of services. Cross-cutting services are injected via dependency injection (constructor injection, no DI container — explicit wiring in composition root).

**Module Services**
- `FinanceService` — GL operations, journal entries, period management, consolidation
- `APService` / `ARService` — Payables and receivables, payment runs, aging
- `CurrencyService` — Exchange rates, currency conversion, revaluation
- `ProcurementService` — PO lifecycle, vendor management, goods receipt, 3-way matching
- `SalesService` — Quote-to-order, order fulfillment, invoicing
- `CRMService` — Contact/company management, opportunity pipeline, activity tracking
- `LogisticsService` — Pick/pack/ship, customs documentation, carrier integration
- `ProductCatalogService` — SKU management, pricing, classification

**Cross-Cutting Services**
- `ComplianceService` — Export classification lookup, denied-party screening, transaction hold/release. Called synchronously in the critical path of every transaction-creating operation
- `AuditService` — Append-only audit log writes. Receives events from all services. Writes are async but guaranteed (PostgreSQL-backed queue ensures no audit entries are lost)
- `WorkflowService` — Approval chain management, step progression, escalation timers
- `NotificationService` — Multi-channel notification dispatch (in-app, email, webhook)
- `AuthorizationService` — RBAC evaluation, entity-scope resolution, ITAR compartment checks

**Transaction Management**
- Services receive a transaction context (Kysely `Transaction` object) from the API layer
- All operations within a single request execute in a single database transaction
- Compliance checks, audit log writes, and workflow state changes are part of the same transaction — if the compliance check fails, nothing is persisted
- Long-running operations (report generation, bulk imports) use separate transactions with progress tracking

**Event Emission**
- Services emit domain events after successful transaction commit
- Events are published to the internal event bus for cross-module communication
- Event types: `entity.created`, `entity.updated`, `entity.deleted`, `entity.status_changed`, `compliance.screening_completed`, `workflow.step_completed`
- Subscribers handle non-critical-path processing: notification dispatch, search index updates, webhook delivery

### 3.3 Domain Layer

The domain layer defines entity models, business rules, and validation logic. It has no dependencies on infrastructure (no database, no HTTP, no external services).

**Entity Models**
- TypeScript interfaces and classes representing business entities
- Immutable value objects for money (amount + currency), addresses, exchange rates
- Entity identity via UUID v4 (per ADR-002); generated via PostgreSQL `gen_random_uuid()` — widely supported across the PostgreSQL ecosystem and ORMs, avoids the tooling gaps of ULIDs. Auto-increment integers are avoided because they leak information about record counts
- Shared `Money` type enforces that arithmetic never mixes currencies without explicit conversion

**Business Rules**
- Encoded as pure functions that take entity state and return validation results
- Examples: "a journal entry must have balanced debits and credits", "a PO cannot be approved by its creator", "an ITAR-classified item cannot be shipped to a restricted country without a license"
- Rules are composable: module-specific rules can be augmented by compliance rules and workflow rules

**Domain Events**
- Typed event objects: `SalesOrderCreated`, `PaymentApplied`, `ScreeningCompleted`, etc.
- Events carry the minimum data needed for subscribers to act (entity ID, entity type, key field changes)
- Events are the mechanism for cross-module communication without direct service coupling

### 3.4 Data Layer

The data layer handles all persistence concerns. It is the only layer that knows about PostgreSQL, Redis, or object storage.

**Repository Pattern**
- Each entity type has a repository class that encapsulates all database operations
- Repositories accept and return domain objects, not database rows
- Repositories use Kysely for query construction — complex queries (financial reporting, aging calculations, consolidation) are written as composable query builders, not raw SQL strings
- Example: `TrialBalanceQueryBuilder` composes account filters, entity scope, period range, and currency conversion into a single efficient query

**Query Builders for Financial Queries**
- Financial reporting requires queries that are too complex for simple CRUD repositories
- Dedicated query builder classes for: trial balance, aging (AP/AR), consolidation with elimination, multi-currency revaluation, budget-vs-actual comparison
- These query builders produce read-only results and operate against read replicas when available
- Materialized views for frequently-accessed aggregations (entity-level balance summaries, pipeline totals)

**Migration Management**
- All schema changes are versioned SQL migrations
- Migrations run automatically on deployment (fail-safe: deployment aborts if migration fails)
- Migrations are forward-only in production (no down migrations — rollback is a new forward migration)
- Each migration includes: schema changes, data migrations if needed, and updated RLS policies
- Migration testing: every migration runs against a snapshot of production-like data in CI

**Connection Pooling**
- PgBouncer in transaction mode for connection pooling
- Separate pools for transactional workloads (write path) and reporting workloads (read replicas)
- Pool sizes tuned per deployment: default 20 connections for write pool, 40 for read pool
- Connection health checks prevent stale connections from causing request failures

### 3.5 Event Bus

The internal event bus enables cross-module communication without direct service dependencies. It is not a distributed message broker — it runs within the application process.

**Implementation**
- **Single-instance deployments:** In-process `EventEmitter` with typed event interfaces. Events are dispatched after transaction commit via PostgreSQL `LISTEN/NOTIFY` to ensure they correspond to committed data
- **Multi-instance deployments:** PostgreSQL `LISTEN/NOTIFY` as the event transport. All instances subscribe to the same channels. For higher throughput, NATS can be configured as an optional transport
- **Guaranteed delivery for critical events:** Audit log entries and compliance events use the transactional outbox pattern — events are written to an `outbox` table in the same transaction as the business data, then dispatched by a background worker. This guarantees no audit events are lost even if the process crashes

**Event Patterns**

| Pattern | Use Case | Example |
|---------|----------|---------|
| Entity lifecycle | Cross-module data synchronization | `SalesOrder.created` triggers compliance screening |
| Compliance events | Audit trail, hold management | `Screening.match_found` places transaction on hold |
| Workflow triggers | Approval chain initiation | `PurchaseOrder.submitted` starts approval workflow |
| Notification triggers | User alerting | `WorkflowStep.pending` sends notification to approver |
| Async processing | Non-critical-path operations | `Report.requested` queues background generation |

**Async Processing (Graphile Worker)**
- Screening list ingestion (daily or on-publish updates)
- Report generation (financial reports, compliance reports)
- Bulk operations (mass screening re-check, bulk import processing)
- Notification delivery (email, webhook)
- Exchange rate updates
- Scheduled jobs (dunning sequence advancement, workflow escalation timeouts)

---

## 4. Module Architecture

### Monorepo Structure

Apogee uses a **Bun workspace monorepo** with the following package layout:

```
apogee/
├── packages/
│   ├── server/                 # Fastify 5 + GraphQL Yoga + Pothos API server
│   │   ├── migrations/         # graphile-migrate SQL migration files
│   │   ├── src/
│   │   │   ├── index.ts        # Entry point
│   │   │   ├── app.ts          # Fastify instance and plugin registration
│   │   │   └── schema.ts       # GraphQL/Pothos schema definition
│   │   ├── test/               # Server tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── shared/                 # Shared types, Zod schemas, value objects (zero deps)
│   │   ├── src/
│   │   │   ├── index.ts        # Public API
│   │   │   ├── types.ts        # Entity interfaces, API contracts
│   │   │   └── schemas.ts      # Zod validation schemas
│   │   ├── test/               # Shared package tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                    # Frontend (placeholder)
│       ├── src/
│       ├── test/
│       ├── package.json
│       └── tsconfig.json
├── docs/                       # HELIX planning artifacts
├── docker-compose.yml          # Local PostgreSQL + Redis
├── Dockerfile.migrate          # Migration runner container
├── biome.json                  # Biome lint + format configuration
├── tsconfig.json               # Root TypeScript project references
└── package.json                # Bun workspace root (workspaces: ["packages/*"])
```

### Module Boundaries and Dependency Rules

Modules follow strict dependency rules enforced by import linting (Biome rules):

```
                    ┌──────────────────────┐
                    │       shared         │  (types, schemas, constants)
                    └──────────┬───────────┘
                               │ depends on
              ┌────────────────┼────────────────┐
              │                │                 │
    ┌─────────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
    │    platform     │ │   finance    │ │    sales     │ ...
    │ (auth, audit,   │ │              │ │              │
    │  compliance,    │ │              │ │              │
    │  workflow)      │ │              │ │              │
    └─────────────────┘ └──────────────┘ └──────────────┘
              ▲                │                 │
              │   depends on   │                 │
              └────────────────┴─────────────────┘
```

**Rules:**
1. **`shared`** has zero dependencies on other packages. It contains only types, schemas, and pure functions.
2. **`platform`** depends only on `shared` and `db`. It provides services consumed by all modules.
3. **Domain modules** (`finance`, `sales`, `procurement`, `crm`, `export-control`, `logistics`) depend on `shared` and `platform`. They never import directly from each other.
4. **Cross-module communication** happens exclusively through the event bus or through the platform compliance service. If Sales needs financial data, it calls through a defined platform interface, not by importing finance internals.
5. **`db`** depends only on `shared`. Repositories are defined here but services that use them live in their respective module packages.
6. **`packages/server`** is the composition root. It wires together all modules, registers routes, and handles dependency injection.

### Shared Kernel

The `shared` package serves as the bounded context's shared kernel:

- **Entity interfaces** — TypeScript interfaces for all entity types referenced across modules (e.g., `Customer` is referenced by sales, finance, CRM, and compliance)
- **Money type** — Immutable value object: `{ amount: string; currency: CurrencyCode }`. Backed by `NUMERIC(19,6)` in the database, paired with a `currency_code` column on every monetary field. Provides financial-grade precision without application-layer scaling. All arithmetic operations enforce currency matching
- **Audit metadata** — Standard fields present on every entity: `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `entityId` (legal entity context)
- **Compliance hooks** — Interface that every transactional service must implement: `getScreeningParties()`, `getClassifiedItems()`, `getDestinationCountry()`
- **Zod schemas** — Validation schemas shared between API layer (request validation) and frontend (form validation)
- **Error types** — Structured error hierarchy: `ValidationError`, `AuthorizationError`, `ComplianceHoldError`, `BusinessRuleError`

### Module Communication Patterns

| Pattern | When to Use | Example |
|---------|-------------|---------|
| **Direct service call (via platform interface)** | Synchronous, in the critical path, data needed for the current operation | Sales order creation calls `ComplianceService.screenTransaction()` — order cannot proceed without result |
| **Domain event (fire-and-forget)** | Asynchronous, not in the critical path, eventual consistency acceptable | `SalesOrder.invoiced` event triggers AR invoice creation in finance module |
| **Shared data via repository** | Read-only access to another module's data | Sales service reads customer credit limit from finance via `CreditRepository` |
| **Workflow integration** | Cross-module approval chains | PO above threshold triggers workflow that requires finance director approval |

---

## 5. Authentication & Authorization

### Authentication Flow

```
User → Browser → Next.js → /api/auth/sso
                              │
                    ┌─────────▼─────────┐
                    │  Identity Provider │
                    │  (SAML 2.0/OIDC)  │
                    └─────────┬─────────┘
                              │ assertion/token
                    ┌─────────▼─────────┐
                    │  Apogee Auth       │
                    │  Middleware        │
                    │  ┌──────────────┐  │
                    │  │ Validate     │  │
                    │  │ assertion    │  │
                    │  ├──────────────┤  │
                    │  │ JIT provision│  │
                    │  │ user record  │  │
                    │  ├──────────────┤  │
                    │  │ Check MFA    │  │
                    │  │ requirement  │  │
                    │  ├──────────────┤  │
                    │  │ Create       │  │
                    │  │ session      │  │
                    │  └──────────────┘  │
                    └───────────────────┘
```

**SSO Integration**
- SAML 2.0 and OIDC are both supported. Configuration specifies which protocol and IdP metadata URL
- Just-in-time (JIT) user provisioning: on first login via SSO, a local user record is created with default role assignment. Administrators can pre-provision users via API for role pre-assignment
- IdP attribute mapping is configurable (map IdP claims to Apogee user fields)
- Multiple IdPs supported (e.g., one per legal entity or business unit)

**MFA**
- Enforced globally, by role, or per user (PLT-US-002)
- TOTP (authenticator apps: Google Authenticator, Authy, etc.) and WebAuthn/FIDO2 (YubiKey, platform authenticators)
- MFA status is encoded in the session. Endpoints guarding ITAR data require MFA-verified sessions
- Recovery codes generated at MFA enrollment (hashed, one-time use)

**Session Management**
- Sessions stored in Redis (primary) or PostgreSQL (fallback)
- Configurable inactivity timeout (default: 30 minutes)
- Absolute session lifetime (default: 12 hours) — even active sessions expire
- Session table tracks: user, IP, user agent, MFA status, last activity, created timestamp
- Users can view and revoke their own sessions. Administrators can revoke any session
- On IdP outage: cached sessions remain valid for a configurable grace period (default: 4 hours) to avoid disrupting operations (Open Design Question 6 — resolved with configurable grace period and security-team-visible alert)

### RBAC Model

```
User ──1:N──▶ RoleAssignment ──N:1──▶ Role ──1:N──▶ Permission
                   │
                   ├── scope: global | entity | program | itar_compartment
                   ├── scope_id: (entity ID, program ID, compartment ID)
                   ├── starts_at: datetime
                   └── ends_at: datetime (nullable)
```

**Permission Structure**
```typescript
interface Permission {
  resource: string;      // e.g., "sales_order", "journal_entry", "screening_result"
  action: Action;        // "create" | "read" | "update" | "delete" | "approve" | "export"
  scope: Scope;          // "global" | "entity" | "program" | "itar_compartment"
}
```

**Built-in Roles (examples):**
- `system_admin` — Full access, all entities. Cannot bypass compliance holds
- `entity_admin` — Full access within a single legal entity
- `finance_controller` — GL, AP, AR, reporting within assigned entities
- `sales_manager` — Orders, quotes, CRM within assigned entities
- `compliance_officer` — Screening review, hold release, classification management. Global scope required
- `auditor` — Read-only access to audit logs, all entities. Cannot modify data

**Entity-Level Access Control**
- Every data record has an `entity_id` column referencing the legal entity that owns it
- RBAC enforcement adds `WHERE entity_id IN (...)` to every query, scoped to the user's authorized entities
- PostgreSQL Row-Level Security (RLS) provides a second enforcement layer at the database level — even if application code has a bug, RLS prevents cross-entity data leakage
- Cross-entity operations (intercompany transactions, consolidated reporting) require explicit cross-entity permissions

**ITAR Compartmentalization**
- ITAR programs are tagged with a compartment ID
- Users must have an explicit ITAR compartment permission to see, search, or access any record tagged with that compartment
- Records in ITAR compartments are invisible to unauthorized users — search results, list views, and counts exclude them. Users cannot infer the existence of compartmented records
- ITAR compartment access is logged separately in the audit trail for compliance review

---

## 6. Audit System

### Design Principles

The audit system is append-only and tamper-evident. It records every create, update, and delete operation across all entity types, every authentication event, and every compliance decision. The audit log is the system's evidentiary record for SOX compliance, ITAR recordkeeping, and regulatory examination.

### Audit Entry Schema

```sql
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id         UUID NOT NULL,
    user_email      TEXT NOT NULL,          -- denormalized for long-term readability
    operation       TEXT NOT NULL,          -- 'create', 'update', 'delete'
    entity_type     TEXT NOT NULL,          -- 'sales_order', 'journal_entry', etc.
    entity_id       UUID NOT NULL,
    entity_context  UUID NOT NULL,          -- legal entity ID
    before_state    JSONB,                  -- null for creates
    after_state     JSONB,                  -- null for deletes
    changed_fields  TEXT[],                 -- list of field names that changed
    source          TEXT NOT NULL,          -- 'ui', 'api', 'system', 'import', 'workflow'
    ip_address      INET,
    user_agent      TEXT,
    request_id      UUID,                   -- correlation ID for the request
    chain_hash      BYTEA NOT NULL,         -- SHA-256 hash of previous entry + current entry
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (timestamp);
```

### What Gets Logged

| Category | Events |
|----------|--------|
| Data operations | Every INSERT, UPDATE, DELETE on business entities. Field-level before/after diff |
| Authentication | Login success, login failure, MFA challenge, MFA success/failure, session creation, session expiry, session revocation |
| Authorization | Permission denied events (who tried to access what and was blocked) |
| Compliance | Screening initiated, screening result (clear/match/fuzzy), hold placed, hold released (with officer ID and rationale), classification changed |
| Workflow | Workflow initiated, step assigned, approval, rejection, delegation, escalation, completion |
| System | Configuration changes, role/permission changes, user provisioning, migration execution |

### Tamper Detection

- **Cryptographic chaining:** Each audit entry includes a `chain_hash` — the SHA-256 hash of the previous entry's hash concatenated with the current entry's content. This creates a hash chain that detects any insertion, deletion, or modification of entries
- **Partition-level checksums:** When a time partition is closed (e.g., monthly), a partition checksum is computed and stored separately. Periodic verification compares current checksums against stored values
- **Write-once enforcement:** The `audit_log` table has no UPDATE or DELETE permissions granted to the application database role. Only INSERT and SELECT are permitted. Database superuser access is restricted and itself audit-logged at the infrastructure level

### Retention and Archival

- **Minimum retention:** 5 years (configurable per entity type — some may require longer for ITAR)
- **Partitioning:** Monthly partitions. Active partitions reside on primary storage. Partitions older than the configurable hot retention period (default: 2 years) are moved to cold storage (compressed, potentially on slower disks or S3-backed tablespace)
- **Archival:** Partitions past the hot period can be detached and archived to S3-compatible storage as Parquet files for long-term retention and regulatory examination
- **Search:** GIN indexes on `entity_type`, `entity_id`, `user_id`, and `timestamp` for efficient query across the audit log. Full-text search on `before_state`/`after_state` JSONB for content-based investigation

---

## 7. Compliance Integration Architecture

Export control compliance is not a module feature — it is infrastructure. The system is designed so that compliance checks cannot be bypassed, disabled, or worked around (Constraint C4). This section describes how compliance is wired into the transaction lifecycle.

### Compliance Gate Architecture

```
Transaction Request (e.g., create Sales Order)
    │
    ▼
┌─────────────────────────────────────┐
│  1. Validate business rules         │
│     (line items, pricing, etc.)     │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│  2. ComplianceService.screen()      │
│     ├── Item classification check   │
│     │   (all items must have ECCN   │
│     │    or USML classification)    │
│     ├── Denied-party screening      │
│     │   (all parties: customer,     │
│     │    end-user, intermediary,    │
│     │    ship-to address)           │
│     ├── Country restriction check   │
│     │   (destination vs. embargo/   │
│     │    restriction rules)         │
│     └── License requirement check   │
│         (does this transaction      │
│          require an export license?)│
└──────────────────┬──────────────────┘
                   │
           ┌───────┴───────┐
           │               │
      CLEAR            HOLD REQUIRED
           │               │
           ▼               ▼
┌──────────────┐  ┌────────────────────┐
│ 3. Persist   │  │ 3. Persist with    │
│    record    │  │    hold status     │
│    (active)  │  │    (compliance_    │
│              │  │     hold)          │
└──────────────┘  └────────┬───────────┘
                           │
                           ▼
                  ┌────────────────────┐
                  │ 4. Notify          │
                  │    compliance      │
                  │    officer         │
                  └────────┬───────────┘
                           │
                           ▼
                  ┌────────────────────┐
                  │ 5. Officer reviews │
                  │    and releases    │
                  │    (or confirms    │
                  │     hold)          │
                  └────────────────────┘
```

### Screening Service Architecture

The screening service is called **synchronously** in the critical path. A transaction cannot be saved without a screening result.

**Screening Engine**
- Exact match, fuzzy match (Levenshtein distance, Soundex, Double Metaphone), alias matching, and transliteration matching
- Configurable match threshold (default: 85% similarity for fuzzy matches)
- All parties on a transaction are screened: customer, end-user, intermediary, consignee, ship-to contact
- Screening runs against a local copy of all screening lists (no external API call in the critical path — Constraint C5)

**Screening Lists (stored locally)**

| List | Source | Update Frequency |
|------|--------|-----------------|
| OFAC SDN | US Treasury | Daily (Graphile Worker cron job) |
| OFAC Consolidated | US Treasury | Daily |
| Entity List | BIS / Commerce | On publication |
| Denied Persons List | BIS / Commerce | On publication |
| Unverified List | BIS / Commerce | On publication |
| Debarred List | DDTC / State | On publication |
| UK Sanctions List | OFSI | Weekly |
| EU Consolidated List | EU Commission | Weekly |

**Screening List Ingestion Pipeline**
1. Graphile Worker cron job checks for updates (configurable: daily default)
2. Downloads updated list from source (when network available) or accepts manual upload (for air-gapped environments)
3. Parses list into normalized format (name, aliases, addresses, identification numbers)
4. Loads into `screening_list_entries` table with version tracking
5. Triggers re-screening of all open transactions against new entries (background job)
6. Audit-logs the list update with version, entry count, and delta

### Hold/Release Mechanism

- Transactions in `compliance_hold` status cannot progress: cannot be invoiced, shipped, or paid
- Only users with `compliance_officer` role and `compliance.hold.release` permission can release a hold
- Release requires: written rationale, classification of the match (true match, false positive, license covers), and a digital signature (MFA re-verification)
- All hold and release actions are audit-logged with full context
- Hold statistics are tracked for compliance reporting (number of holds, average resolution time, false positive rate)

### Cannot-Bypass Design

The compliance gate is implemented as a **required step in the service layer**, not as optional middleware:

1. **No direct database writes for transactional entities.** All creates and updates go through service methods that include compliance checks. There is no "skip compliance" parameter
2. **Database constraints as a safety net.** Transactional entities have a `compliance_status` column with a CHECK constraint. The status must be `cleared` or `held` — there is no `unchecked` status allowed on persisted records
3. **Compliance service is not mockable in production.** The composition root wires the real compliance service. Test environments use a compliance service that still runs checks but against test screening lists
4. **Audit trail detects circumvention.** Any record without a corresponding screening audit entry triggers an alert. A background job periodically verifies that every transactional record has a screening result

---

## 8. Multi-Entity & Multi-Currency Architecture

### Tenant Model: Row-Level Security (RLS)

**Decision:** Row-level security, not schema-per-entity.

**Rationale:** Schema-per-entity provides stronger isolation but makes cross-entity operations (intercompany transactions, consolidated reporting) extremely complex — requiring cross-schema queries, federated views, or application-level joins. For an ERP where intercompany operations and consolidated reporting are P0 requirements, row-level isolation with PostgreSQL RLS is the correct trade-off. RLS provides database-enforced isolation (not just application-level filtering) while keeping all data in a single schema for efficient cross-entity queries.

**Implementation:**
- Every business table has an `entity_id` column (NOT NULL, indexed)
- PostgreSQL RLS policies are applied to all business tables
- The application sets `SET LOCAL app.current_entity_id = '...'` at the start of each transaction
- RLS policies filter rows based on `current_setting('app.current_entity_id')`
- Cross-entity operations (consolidation, intercompany) use a special `SET LOCAL app.cross_entity = true` that bypasses entity filtering but requires explicit `cross_entity` permission on the user's role
- RLS policies are tested in CI with scenarios that verify: same-entity access works, cross-entity access is blocked without permission, cross-entity access works with permission

### Entity Context

```
User Session
  └── current_entity_id: UUID        (set by entity picker in UI)
  └── authorized_entities: UUID[]    (from RBAC role assignments)

Every API request:
  1. Extract current_entity_id from request header (X-Entity-Id) or session
  2. Verify current_entity_id ∈ authorized_entities
  3. SET LOCAL app.current_entity_id in the database transaction
  4. All queries automatically filtered by RLS
```

**Entity Switching:** Users with access to multiple entities can switch via a persistent entity picker in the navigation. The selection is stored in the session and sent with every request. Switching entity context does not require re-authentication.

### Cross-Entity Operations (Intercompany)

Intercompany transactions are modeled as paired transactions:

1. Entity A creates an intercompany sale to Entity B
2. System automatically creates the corresponding intercompany purchase in Entity B
3. Both transactions reference a shared `intercompany_group_id`
4. On consolidation, transactions with matching `intercompany_group_id` are eliminated
5. Intercompany markup rules (transfer pricing) are applied per entity-pair configuration

### Currency Handling

**Three Currency Layers:**

| Layer | Purpose | Example |
|-------|---------|---------|
| **Transaction currency** | The currency of the original transaction | Customer invoice in EUR |
| **Functional currency** | The entity's operating currency (per entity configuration) | US subsidiary: USD |
| **Reporting currency** | The group's consolidation currency | Group reports in USD |

**Money Type:**
```typescript
interface Money {
  amount: string;          // exact decimal string, e.g. "1234.560000"
  currency: CurrencyCode;  // ISO 4217
}
```

All monetary values are stored as `NUMERIC(19,6)` in the database. Every monetary column is paired with a corresponding `currency_code TEXT NOT NULL` column (ISO 4217). `NUMERIC(19,6)` is the industry standard for financial precision — it supports values up to 13 integer digits with 6 decimal places, which accommodates all world currencies (including those with 3 minor units like BHD) and avoids the application-layer scaling complexity that `BIGINT`-based approaches require. The application uses string representations to preserve exact decimal values across the TypeScript boundary.

**Exchange Rate Service:**
- Exchange rates stored in a `exchange_rates` table: `(from_currency, to_currency, rate_date, rate, source)`
- Configurable rate sources per currency pair (central bank, commercial feed, manual entry)
- Rate lookup: find the rate for a given date, or the most recent rate before that date
- Rate ingestion: Graphile Worker job fetches rates daily from configured sources (when network available) or accepts manual entry for air-gapped environments
- Triangulation: if no direct rate exists for a pair, the system triangulates through a configurable base currency (default: USD)

**Currency Conversion Points:**
- On transaction entry: transaction currency → functional currency (using transaction-date rate)
- On period close: unrealized gain/loss revaluation of open balances
- On payment: realized gain/loss calculation
- On consolidation: functional currency → reporting currency (using period-end rate for balance sheet, average rate for income statement)

---

## 9. Deployment Architecture

### Container Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                      │
│                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ API Pod(s)  │  │ Web Pod(s)  │  │ Worker Pod  │      │
│  │ (Fastify)   │  │ (Next.js)   │  │ (Graphile   │      │
│  │ replicas:   │  │ replicas:   │  │  Worker)    │      │
│  │  2-N        │  │  2-N        │  │ replicas: 1 │      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
│         │                │                 │              │
│  ┌──────▼──────────────────────────────────▼──────┐      │
│  │              Ingress Controller                 │      │
│  │              (TLS termination)                  │      │
│  └─────────────────────────────────────────────────┘      │
│                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ PostgreSQL  │  │ PostgreSQL  │  │ Redis       │      │
│  │ Primary     │  │ Read        │  │ Cluster     │      │
│  │             │  │ Replica(s)  │  │ (optional)  │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│                                                           │
│  ┌─────────────┐  ┌─────────────┐                        │
│  │ PgBouncer   │  │ MinIO       │                        │
│  │ (connection │  │ (S3-compat  │                        │
│  │  pooler)    │  │  storage)   │                        │
│  └─────────────┘  └─────────────┘                        │
└──────────────────────────────────────────────────────────┘
```

### Deployment Options

**Docker Compose (small deployments, development)**
- Single-node deployment with all services in one Docker Compose stack
- Suitable for small operators (1-5 entities, <100 concurrent users)
- Includes: API, Web, Worker, PostgreSQL, Redis (optional per ADR-008 — system functions without it using PostgreSQL-backed sessions and in-memory rate limiting), MinIO, PgBouncer

**Kubernetes (production, GovCloud)**
- Helm chart with configurable values for all components
- Horizontal pod autoscaling for API and Web pods based on CPU/request metrics
- Single Worker pod (Graphile Worker uses PostgreSQL advisory locks for leader election — multiple worker pods are safe but one is sufficient for ERP workloads)
- StatefulSets for PostgreSQL (or use managed PostgreSQL: RDS, CloudNativePG operator)
- Network policies restricting pod-to-pod traffic to only required paths

**AWS GovCloud Considerations**
- All container images stored in ECR GovCloud (no pulls from public registries)
- RDS PostgreSQL with encryption at rest (KMS) and in transit
- ElastiCache Redis with encryption at rest and in transit
- S3 for document storage (replaces MinIO)
- Secrets Manager for database credentials, API keys, encryption keys
- VPC with private subnets — no public internet access for data-plane components
- VPN or Direct Connect for operator access

**On-Premises / Air-Gapped**
- Docker Compose or k3s (lightweight Kubernetes)
- All container images pre-loaded (no registry pull required)
- MinIO for S3-compatible storage
- Screening list updates via manual file upload (USB transfer in air-gapped environments)
- Exchange rates via manual entry
- Offline SSO: cached sessions with extended grace period

### Database Deployment

- **Primary:** Single PostgreSQL 16 instance. All writes go here
- **Read Replicas:** 1+ streaming replicas for reporting queries. Kysely query builders are configured to route read-only queries to replicas
- **Backups:** pg_basebackup for full backups (daily), WAL archiving for point-in-time recovery. Backups encrypted at rest
- **Connection Pooling:** PgBouncer in transaction mode. API pods connect to PgBouncer, not directly to PostgreSQL

### TLS Everywhere

- TLS 1.3 enforced on all external connections (client → ingress)
- TLS 1.2+ on internal connections (pod → PostgreSQL, pod → Redis) — 1.3 where supported
- mTLS between pods if service mesh is deployed (optional, recommended for GovCloud)
- No plaintext connections anywhere in the stack

### Backup and Disaster Recovery

| Component | Backup Strategy | RPO | RTO |
|-----------|----------------|-----|-----|
| PostgreSQL | WAL archiving + daily base backup to S3 | 5 minutes (WAL) | 1 hour |
| Redis | RDB snapshots + AOF (if persistent sessions are required) | 1 hour | 15 minutes |
| MinIO / S3 | Cross-region replication or periodic sync | 1 hour | 1 hour |
| Configuration | Git-versioned Helm values, Terraform state | Real-time | 30 minutes |
| Audit Log | Separate backup stream, archived partitions on S3 | 5 minutes | 2 hours |

---

## 10. Security Architecture

### NIST 800-171 Alignment Summary

Apogee is designed for environments handling CUI (Controlled Unclassified Information). The following maps key NIST 800-171 control families to Apogee's implementation:

| Control Family | Implementation |
|----------------|---------------|
| **3.1 Access Control** | RBAC with entity/program/ITAR-compartment scoping; session management with inactivity timeout; MFA enforcement; principle of least privilege via role-based permission grants |
| **3.2 Awareness & Training** | Out of scope for software — operator responsibility. System provides audit data to support training compliance verification |
| **3.3 Audit & Accountability** | Immutable append-only audit log with cryptographic chaining; 5-year minimum retention; tamper-detection verification; all CUD operations, auth events, and compliance decisions logged |
| **3.4 Configuration Management** | Infrastructure-as-code (Helm, Terraform); container immutability; no configuration changes without deployment pipeline; dependency pinning and vulnerability scanning |
| **3.5 Identification & Authentication** | SSO (SAML 2.0/OIDC) with MFA; unique user identification; API key authentication for service accounts; session management with absolute and inactivity timeouts |
| **3.6 Incident Response** | Structured logging with correlation IDs; alerting on anomalous audit patterns; security event dashboard. Incident response procedures are operator responsibility |
| **3.7 Maintenance** | Automated dependency updates via Renovate; container rebuild on base image updates; zero-downtime rolling deployments |
| **3.8 Media Protection** | Encryption at rest (AES-256 via PostgreSQL TDE or filesystem-level encryption); encrypted backups; secure deletion of decommissioned storage |
| **3.9 Personnel Security** | ITAR compartment access controls; time-bounded role assignments; automated access revocation on role expiry |
| **3.10 Physical Protection** | Infrastructure-level concern — operator responsibility. System supports deployment on physically secured infrastructure (GovCloud, classified facilities) |
| **3.11 Risk Assessment** | Dependency vulnerability scanning in CI; SAST scanning; runtime anomaly detection via audit log analysis |
| **3.12 Security Assessment** | Automated compliance test suite; penetration testing (operator responsibility, system provides test environment support) |
| **3.13 System & Comm. Protection** | TLS 1.3 on all connections; network segmentation via Kubernetes network policies; input validation on all API endpoints; CSRF protection; CSP headers |
| **3.14 System & Information Integrity** | Cryptographic audit chain verification; integrity checks on screening list data; signed container images |

### Encryption

**At Rest:**
- PostgreSQL: Transparent Data Encryption (TDE) or filesystem-level encryption (LUKS/dm-crypt) depending on deployment. AWS RDS uses KMS-managed encryption
- Redis: Encryption at rest via Redis Enterprise or ElastiCache encryption
- MinIO / S3: Server-side encryption (SSE-S3 or SSE-KMS)
- Backups: Encrypted with a separate key from production data

**In Transit:**
- TLS 1.3 for all external connections
- TLS 1.2+ for all internal connections
- Certificate rotation automated via cert-manager (Kubernetes) or ACM (AWS)

**Application-Level Encryption:**
- Sensitive fields (SSN, passport numbers, banking details) encrypted at the application level before database storage using AES-256-GCM
- Encryption keys managed via environment-injected secrets (Kubernetes Secrets, AWS Secrets Manager, HashiCorp Vault)
- Key rotation supported without data re-encryption (envelope encryption pattern: data encrypted with data key, data key encrypted with master key, rotate master key)

### Secrets Management

- No secrets in source code, environment files, or container images
- Kubernetes: Sealed Secrets or External Secrets Operator syncing from Vault/AWS Secrets Manager
- Docker Compose: Docker secrets (swarm mode) or `.env` files with restricted permissions (development only)
- Database credentials, API keys, encryption keys, SAML certificates all managed as secrets
- Secret rotation triggers application reload (graceful, zero-downtime)

### Network Segmentation

```
┌─────────────────────────────────────────────────┐
│  Public Subnet (or DMZ)                         │
│  ┌───────────────────────────────┐              │
│  │  Ingress Controller / ALB     │              │
│  │  (TLS termination, WAF)       │              │
│  └──────────────┬────────────────┘              │
└─────────────────┼───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  Application Subnet (private)                    │
│  ┌──────┐  ┌──────┐  ┌──────┐                  │
│  │ API  │  │ Web  │  │Worker│                  │
│  └──┬───┘  └──────┘  └──┬───┘                  │
└─────┼───────────────────┼───────────────────────┘
      │                   │
┌─────▼───────────────────▼───────────────────────┐
│  Data Subnet (private, no internet)              │
│  ┌──────────┐  ┌──────┐  ┌──────┐              │
│  │PostgreSQL│  │Redis │  │MinIO │              │
│  └──────────┘  └──────┘  └──────┘              │
└─────────────────────────────────────────────────┘
```

- No direct internet access from data subnet
- Application pods can only reach data services on specific ports (5432, 6379, 9000)
- Worker pods have outbound internet access only for: screening list downloads, exchange rate feeds (configurable, can be disabled for air-gapped)
- Kubernetes NetworkPolicy resources enforce all of the above

### Dependency Management

- All dependencies pinned to exact versions (Bun lockfile)
- Automated vulnerability scanning in CI via `bun audit` and Trivy (container images)
- Renovate bot for automated dependency update PRs with CI gate
- No dependencies with known CVEs allowed in production builds (CI fails on critical/high vulnerabilities)
- Supply chain security: `bun.lock` integrity verification, consideration of provenance verification

---

## 11. Performance & Scalability

### Target Scale

| Metric | Target | Design Implication |
|--------|--------|--------------------|
| Legal entities | 50+ | RLS with efficient entity-scoped indexes |
| Active contracts | 10K+ | Partitioned tables, cursor-based pagination |
| Inventory SKUs | 1M+ | Full-text search via GIN indexes, efficient catalog queries |
| Concurrent users | 500+ | Horizontal API scaling, connection pooling, Redis caching |
| Transactions/day | 50K+ | Write-optimized primary, read replicas for reporting |
| Audit log entries | 100M+/year | Time-partitioned tables, archival to cold storage |

### Horizontal Scaling Strategy

- **API pods:** Stateless. Scale horizontally behind load balancer. Each pod connects to PgBouncer
- **Web pods:** Stateless (Next.js with external session store). Scale independently of API pods
- **Worker pods:** Single pod is sufficient for most workloads. Graphile Worker uses PostgreSQL advisory locks for safe multi-pod operation if needed
- **PostgreSQL:** Vertical scaling for writes (larger instance). Read replicas for reporting workloads. Connection pooling via PgBouncer keeps connection count manageable
- **Redis:** Redis Cluster for large deployments; single instance for small/medium

### Database Optimization

**Indexing Strategy:**
- Every `entity_id` column has an index (RLS filter performance)
- Composite indexes for common query patterns: `(entity_id, status)`, `(entity_id, created_at)`, `(customer_id, entity_id, status)`
- GIN indexes on `tsvector` columns for full-text search
- GIN indexes on JSONB columns used for filtering (custom fields, metadata)
- Partial indexes for "active records" queries: `CREATE INDEX ON sales_orders (entity_id) WHERE status NOT IN ('cancelled', 'archived')`

**Partitioning:**
- `audit_log`: Range-partitioned by month on `timestamp`
- `exchange_rates`: Range-partitioned by year on `rate_date`
- `screening_results`: Range-partitioned by month on `screened_at`
- Large transaction tables (journal entries, invoice lines): Range-partitioned by year on `created_at` once volume warrants it

**Materialized Views:**
- Entity-level balance summaries (refreshed on period close)
- Pipeline aggregation (refreshed on opportunity change)
- AR/AP aging buckets (refreshed hourly or on-demand)
- Materialized views are refreshed concurrently (no lock on read during refresh)

### Caching Strategy (Redis)

| Cache | TTL | Invalidation |
|-------|-----|-------------|
| User session | 30 min (sliding) | Explicit logout, admin revocation |
| RBAC permissions (per user) | 5 min | Role/permission change event |
| Entity configuration | 10 min | Entity config update event |
| Exchange rates (current) | 1 hour | Rate update job |
| Screening list hash | Until next update | List ingestion job |
| Rate limiting counters | Per window (1 min, 1 hour) | Automatic expiry |

**Cache-aside pattern:** Application checks Redis first, falls back to PostgreSQL on miss, populates Redis on read. Write-through for critical data (session, rate limits).

### Background Job Processing (Graphile Worker)

| Job Type | Priority | Concurrency | Timeout |
|----------|----------|-------------|---------|
| Compliance screening (re-check) | High | 4 | 5 min |
| Screening list ingestion | High | 1 | 30 min |
| Report generation | Medium | 2 | 15 min |
| Email notification | Medium | 4 | 30 sec |
| Webhook delivery | Medium | 4 | 30 sec |
| Exchange rate update | Low | 1 | 5 min |
| Dunning advancement | Low | 1 | 10 min |
| Audit partition maintenance | Low | 1 | 1 hour |

---

## 12. Monitoring & Observability

### Structured Logging

- **Library:** pino (Fastify's default, high-performance structured JSON logger)
- **Log Levels:** `fatal`, `error`, `warn`, `info`, `debug`, `trace`
- **Production default:** `info`
- **Every log entry includes:** timestamp, level, message, `request_id` (correlation ID), `user_id`, `entity_id`, module name
- **Sensitive data redaction:** PII fields, auth tokens, and secrets are automatically redacted from logs via pino redact configuration
- **Log aggregation:** stdout/stderr → collected by Kubernetes logging (Fluentd/Fluent Bit → Loki or Elasticsearch)

### Metrics (Prometheus-Compatible)

Exposed via `/metrics` endpoint on each pod (prom-client library):

**Application Metrics:**
- `http_requests_total` — counter by method, route, status code
- `http_request_duration_seconds` — histogram by route
- `graphql_operations_total` — counter by operation name, status
- `db_query_duration_seconds` — histogram by query type (read/write)
- `db_pool_connections` — gauge (active, idle, waiting)
- `compliance_screenings_total` — counter by result (clear, match, fuzzy, error)
- `compliance_holds_active` — gauge
- `workflow_instances_active` — gauge by status
- `background_jobs_processed_total` — counter by job type, status
- `background_jobs_queue_depth` — gauge by job type

**Business Metrics:**
- `audit_log_entries_total` — counter by entity type, operation
- `active_sessions` — gauge
- `entity_count` — gauge (legal entities)

### Distributed Tracing

- **Library:** @opentelemetry/sdk-node with auto-instrumentation for Fastify, Kysely, Redis, and HTTP
- **Trace propagation:** W3C Trace Context headers (`traceparent`, `tracestate`)
- **Span coverage:** Every HTTP request creates a root span. Database queries, Redis operations, compliance checks, and event bus dispatches create child spans
- **Export:** OTLP exporter to Jaeger, Tempo, or any OTLP-compatible backend
- **Sampling:** 100% of error traces, configurable sampling rate for successful requests (default: 10% in production)

### Health Checks

**Liveness probe** (`/health/live`):
- Returns 200 if the process is running
- No dependency checks — this probe determines if the pod should be restarted

**Readiness probe** (`/health/ready`):
- Checks PostgreSQL connectivity (simple query)
- Checks Redis connectivity (PING) if configured
- Returns 503 if any critical dependency is unreachable (PostgreSQL unavailability triggers 503; Redis is not a critical dependency)
- Pod removed from load balancer rotation when not ready

**Startup probe** (`/health/startup`):
- Checks that migrations have been applied and the schema is at expected version
- Checks that screening lists are loaded
- Allows longer timeout for initial startup (migrations may take time)

### Alerting

| Alert | Condition | Severity |
|-------|-----------|----------|
| API error rate high | >1% of requests returning 5xx over 5 minutes | Critical |
| API latency high | p99 >2s over 5 minutes | Warning |
| Database connection pool exhausted | 0 idle connections for >30 seconds | Critical |
| Compliance screening errors | Any screening returning error status | Critical |
| Screening list stale | >48 hours since last successful update | Warning |
| Audit log write failures | Any failure to write audit entry | Critical |
| Disk space low | <20% free on PostgreSQL volume | Warning |
| Background job queue depth | >1000 jobs pending for >10 minutes | Warning |
| Authentication failures spike | >10 failures per minute from single IP | Warning |

---

## 13. Development Practices

### Monorepo Tooling

- **Runtime and package manager:** Bun (workspaces defined in root `package.json` via `"workspaces": ["packages/*"]`)
- **Linting and formatting:** Biome (configured in `biome.json`, replaces ESLint + Prettier)
- **Type checking:** TypeScript project references via `tsc --noEmit` per package

### Package Structure (per module)

```
packages/server/
├── migrations/                 # graphile-migrate SQL migration files
├── src/
│   ├── index.ts                # Entry point
│   ├── app.ts                  # Fastify instance and plugin registration
│   └── schema.ts               # GraphQL/Pothos schema definition
├── test/
│   ├── app.test.ts             # Server integration tests (bun:test)
│   └── ...
├── package.json
└── tsconfig.json
```

### Testing Strategy

| Level | Scope | Tools | Database | Coverage Target |
|-------|-------|-------|----------|----------------|
| **Unit** | Domain rules, value objects, pure functions | bun:test | None | 90%+ for domain logic |
| **Integration** | Service layer with real database | bun:test | PostgreSQL (via Docker Compose) | 80%+ for services |
| **API** | REST/GraphQL endpoints with auth context | bun:test | PostgreSQL (via Docker Compose) | 80%+ for routes |
| **E2E** | Full user workflows through the browser | Playwright | Full stack (Docker Compose) | Critical paths: financial close, order-to-ship, compliance hold/release |
| **Compliance** | Export control scenarios | Custom harness | PostgreSQL with test screening lists | 100% of known-good and known-bad scenarios |
| **Performance** | Load testing at target scale | k6 | Production-like environment | Must meet latency targets at target concurrency |

### CI/CD Pipeline

```
Push / PR
    │
    ├── Lint + Format (Biome check)
    ├── Type Check (tsc --noEmit per package)
    ├── Unit + Integration Tests (bun test)
    │
    ├── Container Image Build (multi-stage Dockerfile)
    │
    ├── Security Scan
    │   ├── bun audit (dependency vulnerabilities)
    │   └── Trivy (container image vulnerabilities)
    │
    ├── E2E Tests (Playwright against Docker Compose stack)
    │
    └── Deploy (on merge to main)
        ├── Push container images to registry
        ├── Update Helm chart values
        └── Rolling deployment to staging / production
```

### Database Migration Strategy

- Migrations are plain SQL files managed by graphile-migrate in `packages/server/migrations/`
- Each migration is a numbered file: `000001_create_users.sql`, `000002_create_entities.sql`, etc.
- Migrations are forward-only. To undo a change, write a new migration
- Migrations are applied via `bun run migrate` (runs `graphile-migrate migrate`)
- CI runs migrations against a test database before running integration tests
- Schema changes and RLS policy updates are always paired in the same migration

### Code Quality

- **Linting and Formatting:** Biome (configured in `biome.json`). Enforced in CI via `bun run lint`, auto-fixed with `bun run lint:fix`
- **Type Checking:** `tsc --noEmit` per package in CI. Strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any` types
- **Commit Conventions:** Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
- **Code Review:** All changes require PR review. Changes to compliance, auth, or audit code require review from two approvers

---

*This architecture document is governed by the [PRD](../../01-frame/prd.md) and [FEAT-009](../../01-frame/features/FEAT-009-platform-infrastructure.md). All implementation must conform to the decisions documented here. Deviations require an architecture decision record (ADR) with justification.*
