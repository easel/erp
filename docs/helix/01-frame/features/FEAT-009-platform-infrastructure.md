# FEAT-009: Platform & Infrastructure

**Authority Level:** 3 (Governing)
**Status:** Draft
**Created:** 2026-04-04
**Governed by:** [PRD](../prd.md)

---

## Overview

The platform layer provides the technical foundation on which every Apogee module operates. It is not a user-facing "feature" in the traditional sense but rather the set of cross-cutting capabilities that every module depends on: authentication, authorization, auditing, APIs, workflow orchestration, notifications, reporting, data import/export, localization, extensibility, and deployment infrastructure.

Apogee is self-hosted on operator infrastructure or GovCloud. It must handle ITAR-controlled and CUI data in compliance with NIST 800-171. Core functions must operate without external network dependencies. The platform must support 50+ legal entities, 10K+ contracts, and 1M+ SKUs without performance degradation.

The technology stack is Isomorphic TypeScript on Bun (Node.js LTS fallback) with a local-first architecture: client-side state is persisted in SQLite for offline operation, PostgreSQL is the server-side store (relational, document, and time-series data), and REST + GraphQL APIs handle all module interactions. Shared isomorphic packages ensure domain types, validation schemas, and business rules run identically on client and server.

## User Stories

### Authentication & Authorization

- **PLT-US-001:** As a system administrator, I want to configure SSO via SAML 2.0 or OIDC so that users authenticate through the operator's identity provider without maintaining separate credentials.
- **PLT-US-002:** As a system administrator, I want to enforce MFA for all users or by role so that access to ITAR-controlled data requires strong authentication.
- **PLT-US-003:** As a system administrator, I want to define roles with granular permissions (entity-level, program-level, ITAR compartment-level) so that users only see and modify data they are authorized for.
- **PLT-US-004:** As a compliance officer, I want ITAR compartment-level access controls so that only personnel with appropriate authorization can view ITAR-controlled programs, components, and documents.
- **PLT-US-005:** As a user, I want my session to persist across browser tabs but expire after a configurable inactivity timeout so that I am not repeatedly prompted to log in but idle sessions are secured.

### Audit

- **PLT-US-010:** As a compliance officer, I want every create, update, and delete operation to be recorded in an immutable audit log so that I can reconstruct the full history of any record.
- **PLT-US-011:** As an auditor, I want to search the audit log by entity type, record ID, user, date range, and operation type so that I can efficiently investigate specific transactions.
- **PLT-US-012:** As a system administrator, I want audit log entries to be tamper-evident (cryptographically chained or write-once storage) so that log integrity can be verified.
- **PLT-US-013:** As a compliance officer, I want audit logs retained for a minimum of 5 years with configurable retention per entity type so that recordkeeping requirements (SOX, ITAR) are met.

### APIs

- **PLT-US-020:** As a developer, I want REST endpoints for all CRUD operations across all modules so that I can integrate with external systems using standard HTTP.
- **PLT-US-021:** As a developer, I want a GraphQL API so that I can query exactly the fields I need across related entities in a single request.
- **PLT-US-022:** As a developer, I want all API endpoints to support pagination, filtering, sorting, and rate limiting so that large data sets are handled efficiently and the system is protected from abuse.
- **PLT-US-023:** As a system administrator, I want API authentication via OAuth 2.0 bearer tokens and API keys so that service-to-service integrations are secured.

### Workflow Engine

- **PLT-US-030:** As a system administrator, I want to define approval workflows with configurable steps, approvers (by role or named user), escalation rules, and timeout actions so that business processes enforce the required approval chains.
- **PLT-US-031:** As a user, I want to see my pending approvals in a unified inbox so that I can act on workflow tasks without navigating to each module separately.
- **PLT-US-032:** As a system administrator, I want to configure workflows for any entity type (POs, sales orders, journal entries, milestone signoffs, compliance overrides, shipments) so that approval logic is centralized, not hard-coded per module.
- **PLT-US-033:** As a user, I want to approve, reject, or delegate a workflow step with comments so that decision rationale is captured in the audit trail.

### Notifications

- **PLT-US-040:** As a user, I want to receive in-app notifications for workflow tasks, compliance alerts, and system events so that I am aware of items requiring my attention without checking email.
- **PLT-US-041:** As a user, I want to configure my notification preferences (in-app, email, both, or none) per event type so that I control how I am notified.
- **PLT-US-042:** As a system administrator, I want to configure webhook endpoints for notification delivery so that external systems can subscribe to Apogee events.

### Reporting

- **PLT-US-050:** As a finance analyst, I want to build reports with configurable filters, grouping, and column selection across any module's data so that I can answer ad-hoc business questions without developer support.
- **PLT-US-051:** As a user, I want to drill down from summary report rows to the underlying source records so that I can investigate anomalies.
- **PLT-US-052:** As a user, I want to export reports to CSV, PDF, and Excel so that I can share data with stakeholders who do not have Apogee access.
- **PLT-US-053:** As a user, I want to save report configurations and schedule recurring report generation so that standard reports are available without manual rebuilding.

### Data Import/Export

- **PLT-US-060:** As a system administrator, I want to import data from CSV and Excel files with column mapping, validation, and error reporting so that I can migrate data from legacy systems.
- **PLT-US-061:** As a system administrator, I want to export any entity's data via API for ongoing integration with external systems so that Apogee is not a data silo.
- **PLT-US-062:** As a system administrator, I want import operations to run in preview mode (validate without committing) so that I can verify data quality before importing.

### Localization

- **PLT-US-070:** As a user in a non-English office, I want the UI displayed in my preferred language so that I can work efficiently in my native language.
- **PLT-US-071:** As a user, I want dates, numbers, and currencies formatted according to my locale so that financial data is unambiguous.

### Extensions

- **PLT-US-080:** As an operator developer, I want to register plugins that add custom fields, validation rules, or UI components without modifying core Apogee code so that operator-specific customizations survive upgrades.
- **PLT-US-081:** As a system administrator, I want to enable or disable plugins per entity so that customizations can be scoped to specific legal entities.

### Deployment

- **PLT-US-090:** As an IT administrator, I want to deploy Apogee using Docker containers with Kubernetes manifests so that deployment follows standard infrastructure-as-code practices.
- **PLT-US-091:** As an IT administrator, I want to configure per-entity data residency (which database/region stores a given entity's data) so that national data sovereignty requirements are met.

## Acceptance Criteria

### PLT-001: Isomorphic TypeScript on Bun with REST and GraphQL APIs

*Traces to: PRD PLT-001*

- [ ] Backend is implemented in TypeScript running on Bun as the primary runtime. Node.js LTS is supported as a fallback runtime. CI tests run on both runtimes.
- [ ] Every module exposes REST endpoints following OpenAPI 3.x specification
- [ ] Every module exposes GraphQL queries and mutations via a unified schema
- [ ] All endpoints support pagination (cursor-based and offset), filtering, and sorting
- [ ] Rate limiting is configurable per endpoint and per API key
- [ ] API documentation is auto-generated from code annotations

### PLT-002: RBAC with Entity-Level, Program-Level, and ITAR Compartment-Level Permissions

*Traces to: PRD PLT-002*

- [ ] System supports role definitions with permissions scoped to: global, entity (legal entity), program, and ITAR compartment
- [ ] Permissions are enforced on every API call and UI render (no client-side-only enforcement)
- [ ] ITAR compartment permissions restrict visibility of programs, inventory items, documents, and transactions to authorized users
- [ ] A user with no ITAR compartment access cannot see, search, or infer the existence of ITAR-controlled records. ITAR-controlled records are excluded from list counts, search results, API responses, audit log queries, and report aggregations for unauthorized users. Record IDs referencing ITAR-controlled records return 404 (not 403) to prevent existence inference.
- [ ] Role assignments support time-bounding (start/end dates) for temporary access
- [ ] Permission changes are audit-logged

### PLT-003: Immutable Audit Log

*Traces to: PRD PLT-003*

- [ ] Every create, update, and delete operation on any entity produces an audit log entry
- [ ] Audit entries include: timestamp, user, operation type, entity type, entity ID, before-state, after-state (field-level diff), and source (UI, API, system)
- [ ] Audit log entries cannot be modified or deleted through any API or UI
- [ ] Audit log supports tamper-evidence verification (cryptographic chaining (SHA-256 hash chain per ADR-004) AND append-only storage (no UPDATE or DELETE on audit_entry table))
- [ ] Audit log is searchable by entity type, entity ID, user, date range, and operation type
- [ ] Audit log retention is configurable per entity type with a minimum of 5 years

### PLT-004: Multi-Tenant Data Model

*Traces to: PRD PLT-004*

- [ ] System supports 50+ legal entities with per-entity configuration (chart of accounts, currency, tax rules, etc.)
- [ ] Data isolation ensures users scoped to one entity cannot access another entity's data unless explicitly granted cross-entity permissions
- [ ] Cross-entity operations (intercompany transactions, consolidated reporting) are supported for users with appropriate permissions
- [ ] Entity creation and configuration is available through both UI and API

### PLT-005: PostgreSQL Database

*Traces to: PRD PLT-005*

- [ ] PostgreSQL is the sole required database (no mandatory Redis, MongoDB, etc. for core functions)
- [ ] Time-series data (telemetry, EVM snapshots, exchange rates) is stored efficiently using PostgreSQL partitioning or TimescaleDB extension
- [ ] Document data (contracts, certificates, attachments) is stored as PostgreSQL large objects or in a configurable object store with database metadata
- [ ] Schema migrations are versioned and applied automatically on deployment
- [ ] Database supports read replicas for reporting workloads without impacting transactional performance

### PLT-006: SSO, MFA, and Session Management

*Traces to: PRD PLT-006*

- [ ] SSO integration supports SAML 2.0 and OIDC protocols
- [ ] MFA can be enforced globally, by role, or per user
- [ ] MFA supports TOTP (authenticator apps) and WebAuthn/FIDO2 (hardware keys)
- [ ] Sessions expire after configurable inactivity timeout (default: 30 minutes)
- [ ] Active sessions are visible to the user and can be revoked
- [ ] Failed login attempts trigger account lockout after configurable threshold. Failed login lockout threshold: default 5 attempts. Lockout duration: default 30 minutes. Locked accounts can be unlocked by administrators before timeout. All lockout events are audit-logged.

### PLT-007: Configurable Workflow/Approval Engine

*Traces to: PRD PLT-007*

- [ ] Administrator can define workflows with sequential and parallel approval steps
- [ ] Approvers can be assigned by role, named user, or dynamic rule (e.g., "manager of requester")
- [ ] Workflows support escalation on timeout (configurable per step). Default escalation timeout: 48 hours. Escalation action: notify next approver in chain. If no next approver exists, notify system administrator.
- [ ] Workflow steps support approve, reject, and delegate actions with mandatory comment on reject
- [ ] Workflow engine is generic: any entity type can have workflows attached via configuration, not code
- [ ] Workflow history (all actions, timestamps, comments) is persisted and audit-logged

### PLT-008: Notification System

*Traces to: PRD PLT-008*

- [ ] Notifications delivered via in-app, email, and webhook channels
- [ ] Users can configure per-event-type channel preferences
- [ ] In-app notifications appear in a unified notification center with read/unread status
- [ ] Email notifications use configurable templates with entity-specific data
- [ ] Webhook notifications include event type, entity reference, and summary payload
- [ ] Notification delivery failures are retried with exponential backoff and logged

### PLT-009: Reporting Engine

*Traces to: PRD PLT-009*

- [ ] User can create reports selecting columns from any module's exposed data fields
- [ ] Reports support filters (equality, range, contains, in-list), grouping, and aggregation (sum, count, avg, min, max)
- [ ] Drill-down from grouped/aggregated rows to underlying records
- [ ] Export to CSV, PDF, and Excel (XLSX)
- [ ] Users can save report configurations and share them with other users or roles
- [ ] Scheduled reports can be configured to run daily, weekly, or monthly with email delivery
- [ ] Standard reports generate within 5 seconds for up to 100,000 rows. Reports exceeding 100,000 rows are executed as background jobs with notification on completion.

### PLT-010: Data Import/Export

*Traces to: PRD PLT-010*

- [ ] Import supports CSV and Excel (XLSX) with configurable column mapping
- [ ] Import runs in preview mode showing validation results (row count, errors, warnings) before commit
- [ ] Import errors include row number, column, value, and reason for rejection
- [ ] Import supports upsert logic (create new, update existing based on key fields)
- [ ] API-based export supports all entity types with the same filtering and pagination as list endpoints
- [ ] Import operations are audit-logged with source file reference

### PLT-011: Multi-Language UI

*Traces to: PRD PLT-011*

- [ ] UI supports language switching without page reload
- [ ] All UI strings are externalized in translation files, not hard-coded
- [ ] Date, number, and currency formatting follows the user's locale setting
- [ ] Right-to-left (RTL) layout is supported for applicable languages
- [ ] Missing translations fall back to English with a developer-visible indicator

### PLT-012: Outbound Webhook System

*Traces to: PRD PLT-012*

- [ ] Webhooks can be registered for any entity lifecycle event (created, updated, deleted, status changed)
- [ ] Webhook payloads include event type, timestamp, entity type, entity ID, and configurable field set
- [ ] Webhook delivery includes retry with exponential backoff (configurable max retries)
- [ ] Webhook endpoints are verified via challenge-response on registration
- [ ] Webhook delivery logs (success/failure, response code, latency) are available to administrators

### PLT-013: Plugin/Extension Architecture

*Traces to: PRD PLT-013*

- [ ] Plugins can add custom fields to existing entities without schema migration by operators
- [ ] Plugins can register custom validation rules that run on create/update operations
- [ ] Plugins can add UI components (tabs, panels, fields) to existing entity views
- [ ] Plugin lifecycle (install, enable, disable, uninstall) is managed through admin UI and API
- [ ] Plugins run in a sandboxed context and cannot bypass RBAC or audit logging
- [ ] Plugin API is versioned with backward compatibility guarantees within major versions

### PLT-014: Per-Entity Data Residency

*Traces to: PRD PLT-014*

- [ ] System administrator can configure which database instance/region stores a given legal entity's data
- [ ] Cross-entity queries that span data residency boundaries are handled transparently (with latency trade-off documented)
- [ ] Data residency configuration is enforced at the data layer, not just the application layer
- [ ] Migration tooling supports relocating an entity's data between residency zones

### PLT-015: Local-First Architecture

*Traces to: PRD PLT-001, ADR-009*

- [ ] Client-side state is persisted in SQLite (via Bun's native SQLite on desktop, sql.js in browser) for offline operation
- [ ] Offline Tier 1 (always available): Read access to recently-synced data, draft creation (quotes, POs, activities), compliance screening against locally-cached screening lists. Cached screening lists display a staleness warning after 24 hours (configurable).
- [ ] Offline Tier 2 (requires eventual sync): Order submission, invoice creation, journal entry posting are created locally with status 'pending_sync'. They are committed on the server upon sync. Server rejection (e.g., compliance hold) surfaces as a sync error with resolution UI.
- [ ] Offline Tier 3 (online-only): Real-time denied-party screening against live lists, payment execution, report generation against full dataset. Attempting a Tier 3 operation while offline returns a clear error: "This operation requires a server connection."
- [ ] Sync protocol: Clients record mutations locally, then push/pull against the server when connected. Conflict resolution uses last-write-wins (LWW) for most entities. Journal entries and compliance decisions use explicit merge UI on conflict.
- [ ] Sync status is visible in the UI: connected/disconnected indicator, last sync timestamp, count of pending-sync items.
- [ ] Shared isomorphic packages contain domain types, Zod validation schemas, and business rule functions that run identically on client and server. Server-side validation is authoritative; client-side is for UX responsiveness.
- [ ] Shared packages have zero platform-specific dependencies (no `fs`, no `window`, no Bun-only APIs).

### PLT-016: Sync Performance NFRs

*Traces to: PRD PLT-001, ADR-009*

- [ ] Initial sync (full dataset for one entity): < 5 minutes for up to 100,000 records
- [ ] Incremental sync: < 10 seconds for up to 1,000 changed records
- [ ] Offline-to-online transition: < 3 seconds to detect connectivity and resume sync

### PLT-017: Frontend Validation Architecture

*Traces to: PRD PLT-001, ADR-010*

- [ ] All entity validation schemas are defined as Zod schemas in `@apogee/shared` and imported by both Pothos resolvers (server) and React Hook Form (client)
- [ ] Client-side form validation uses React Hook Form with `@hookform/resolvers/zod`, validating against the same Zod schemas used server-side
- [ ] Server-side validation failures return a structured `ValidationError` response with `code`, `field`, `message`, `rule`, and `context` fields
- [ ] Client maps server `ValidationError.field` to the corresponding form field for inline error display; errors without `field` display as form-level banners
- [ ] When offline, Layer 1 (structural) validation runs normally; Layer 2 (state-dependent) validation is deferred until sync. A warning banner displays: "Compliance checks are pending until you reconnect."
- [ ] On sync, server-rejected records surface in a resolution UI where the user can edit and resubmit or discard
- [ ] Changing a Zod schema in @apogee/shared causes a TypeScript compile error in any form or resolver that doesn't handle the change — no silent drift

### PLT-018: Domain-Specific ERP Components

*Traces to: PRD PLT-001, PLT-011, ADR-011*

- [ ] MoneyInput component formats per ISO 4217 decimal places (2 for USD, 0 for JPY, 3 for KWD), validates against MoneyAmountSchema, and stores string representation (never JavaScript number)
- [ ] EntitySwitcher in root layout shows all entities the user has access to; switching scopes all data queries to the selected entity; persists selection in localStorage
- [ ] ComplianceStatusBadge displays pending (yellow), cleared (green), held (red) on sales orders, POs, shipments, and quotes with tooltip detail
- [ ] DataTable supports: server-side pagination (25/50/100/250), column sorting, type-aware filtering, inline editing, row selection with bulk actions, CSV/Excel export, virtualization for 1,000+ rows
- [ ] FiscalPeriodPicker shows period status visually (FUTURE/OPEN/SOFT_CLOSED/HARD_CLOSED per ADR-007) and prevents selection of HARD_CLOSED periods for posting forms
- [ ] CountryRegionSelector triggers sub-region selection for countries with sub-national sanctions (e.g., Ukraine) and displays inline compliance warnings for restricted destinations
- [ ] SyncStatusIndicator shows connected/syncing/offline state with last sync timestamp and pending item count; expanding shows sync queue detail
- [ ] All domain components meet WCAG 2.1 AA accessibility requirements

### PLT-019: Navigation Architecture

*Traces to: PRD PLT-001, ADR-011*

- [ ] Next.js App Router with module-based layouts: root layout (auth, entity switcher, global search) and per-module layouts (Finance, Sales, Procurement, CRM, Compliance, Settings) with persistent sidebars
- [ ] Navigating within a module preserves sidebar state; module switch via top nav
- [ ] Breadcrumbs auto-generated from route segments showing entity context
- [ ] Global search (Cmd+K) searches across all modules; when offline, searches local SQLite cache
- [ ] Keyboard shortcuts: Cmd+K (search), Cmd+E (entity switch), G+F (Finance), G+S (Sales), Escape (close modals)
- [ ] Components degrade gracefully offline per ADR-009: DataTable uses client-side pagination from SQLite cache, forms save locally with pending-sync indicator, search uses local FTS

## Domain Model

### Core Entities

- **User** - A person who accesses Apogee. Fields: id, username, email, display name, locale, timezone, MFA status, account status (active, locked, deactivated), last login.
- **Role** - A named set of permissions. Fields: id, name, description, scope (global, entity, program, ITAR compartment), built-in (boolean).
- **Permission** - A granular access right. Fields: id, resource type, action (create, read, update, delete, execute), scope qualifier (entity ID, program ID, compartment ID, or wildcard).
- **RoleAssignment** - Links a user to a role with optional scope and time bounds. Fields: id, user (ref), role (ref), scope qualifier, start date, end date.
- **AuditEntry** - An immutable record of a data operation. Fields: id, timestamp, user (ref), operation (create, update, delete), entity type, entity ID, before state (JSONB), after state (JSONB), source (UI, API, system, import), chain hash.
- **Workflow** - A configurable approval process template. Fields: id, name, entity type, trigger conditions, status (active, draft, archived).
- **WorkflowStep** - A step within a workflow. Fields: id, workflow (ref), sequence, approver rule (role, named user, dynamic), escalation timeout, escalation action.
- **WorkflowInstance** - A running instance of a workflow for a specific entity. Fields: id, workflow (ref), entity type, entity ID, current step, status (pending, approved, rejected, escalated, cancelled), initiated by, initiated at.
- **WorkflowAction** - An action taken on a workflow step. Fields: id, workflow instance (ref), step (ref), actor (ref: User), action (approve, reject, delegate), comment, timestamp.
- **Notification** - A notification sent to a user. Fields: id, user (ref), channel (in-app, email, webhook), event type, entity type, entity ID, subject, body, status (pending, sent, read, failed), created at, sent at.
- **Report** - A saved report configuration. Fields: id, name, description, owner (ref: User), data source (entity type), columns, filters, grouping, aggregations, schedule, shared with (roles/users).
- **Plugin** - A registered extension. Fields: id, name, version, description, author, status (installed, enabled, disabled), configuration, API version.
- **Locale** - A supported language/locale. Fields: id, language code, region code, display name, RTL flag, translation file reference.
- **Webhook** - A registered outbound webhook endpoint. Fields: id, name, URL, event types (array), secret, status (active, paused, failed), retry policy.
- **Session** - An active user session. Fields: id, user (ref), created at, last activity, IP address, user agent, MFA verified.
- **APIKey** - A service account credential. Fields: id, name, key hash, role (ref), created by (ref: User), expires at, status (active, revoked), rate limit.

### Key Relationships

- User 1:N RoleAssignment, 1:N Session, 1:N Notification
- Role 1:N Permission, 1:N RoleAssignment
- Workflow 1:N WorkflowStep, 1:N WorkflowInstance
- WorkflowInstance 1:N WorkflowAction
- Plugin can extend any entity type with custom fields/validation

## Key Workflows

### User Authentication (SSO + MFA)

1. User navigates to Apogee; system redirects to configured IdP (SAML 2.0 or OIDC)
2. User authenticates with IdP; IdP returns assertion/token to Apogee
3. Apogee validates assertion, provisions or updates local user record (JIT provisioning)
4. If MFA is required for the user's role, Apogee prompts for second factor (TOTP or WebAuthn)
5. On success, session is created with configurable timeout; user lands on dashboard
6. On failure or timeout, access is denied and the attempt is audit-logged

### Configurable Approval Workflow

1. A triggering event occurs (e.g., PO submitted, journal entry posted, compliance override requested)
2. Workflow engine evaluates trigger conditions to select the applicable workflow template
3. WorkflowInstance is created; first step's approver is notified (in-app + email per preference)
4. Approver reviews, approves/rejects/delegates with comment
5. On approval, engine advances to next step (or completes if final step)
6. On rejection, entity returns to originator with rejection reason
7. On timeout, escalation action fires (notify manager, auto-approve, or auto-reject per configuration)
8. All actions are recorded as WorkflowAction entries and audit-logged

### Report Generation and Export

1. User creates or opens a saved report configuration
2. User sets or adjusts filters, grouping, columns, and date range
3. System executes query against relevant module data with RBAC filtering
4. Results displayed with drill-down capability on grouped rows
5. User exports to CSV, PDF, or Excel
6. Optionally, user saves configuration and sets a recurring schedule for email delivery

### Data Migration Import

1. Administrator uploads CSV or Excel file and selects target entity type
2. System displays column headers; administrator maps source columns to target fields
3. Administrator runs preview: system validates all rows and reports errors/warnings per row
4. Administrator reviews preview results, corrects source data if needed, and re-uploads
5. Administrator commits import; system creates/updates records with audit log entries referencing the import batch
6. Import summary shows: rows processed, created, updated, skipped, and errored

### Plugin Registration

1. Operator developer packages plugin according to the plugin SDK specification
2. Administrator uploads plugin via admin UI or CLI
3. System validates plugin manifest, checks API version compatibility, and installs in sandboxed context
4. Administrator enables plugin for specific entities or globally
5. Plugin's custom fields, validation rules, and UI components become active
6. Plugin operations are subject to RBAC and audit logging like all core operations

## Technical Architecture Notes

The following notes capture requirements-level architectural decisions. Detailed design will be documented separately.

- **API layer:** All client interactions go through REST or GraphQL endpoints. No direct database access from the frontend. API gateway handles authentication, rate limiting, and request routing.
- **Service layer:** Business logic is organized by module (Financial, Sales, etc.). Platform services (auth, audit, workflow, notification) are consumed by all modules via internal service interfaces.
- **Data layer:** PostgreSQL is the primary store. Each legal entity's data is logically isolated (schema-per-tenant or row-level security, to be determined in design). Time-series data uses partitioned tables or TimescaleDB. Document/attachment storage is pluggable (PostgreSQL large objects for small deployments, S3-compatible object store for larger ones).
- **Event bus:** Internal event system for decoupled module communication. Workflow triggers, notification dispatch, and audit logging subscribe to entity lifecycle events. Must function without external message brokers (in-process event bus for single-node; optional external broker for scaled deployments).
- **Offline capability:** Core functions must operate without external network access. SSO can fall back to cached sessions. Screening list updates queue when connectivity is restored. No CDN dependencies for the UI.

## Integration Points

| External System / Module | Integration | Direction |
|--------------------------|------------|-----------|
| All Apogee modules | Every module uses PLT for auth, RBAC, audit, workflow, notifications, and reporting | Modules consume PLT services |
| SSO Identity Providers | SAML 2.0 / OIDC for authentication | Inbound (IdP to PLT) |
| Email service (SMTP) | Outbound email for notifications, reports, and workflow alerts | Outbound |
| Carrier/logistics APIs | Webhook and REST integration for shipping carriers (via LOG module) | Outbound |
| Banking APIs | Payment file generation and reconciliation (via FIN module) | Outbound |
| Screening list sources | Automated ingestion of OFAC, BIS, and allied-nation lists (via EXP module) | Inbound |
| Object storage (S3-compatible) | Document and attachment storage for large deployments | Bidirectional |
| Monitoring (Prometheus/Grafana) | Metrics export for infrastructure monitoring | Outbound |

## Open Design Questions

1. **Multi-tenancy strategy:** Schema-per-entity vs. row-level security (RLS) for data isolation? Schema-per-entity provides stronger isolation and simpler per-entity backup/restore but complicates cross-entity queries. RLS is simpler to implement but requires careful policy management.
2. **GraphQL federation vs. monolithic schema:** Should each module own its own GraphQL subgraph (federated) or should there be a single unified schema? Federation scales better organizationally but adds infrastructure complexity for self-hosted deployments.
3. **Event bus implementation:** In-process (e.g., EventEmitter / in-memory queue) for single-node deployments vs. requiring an external broker (NATS, RabbitMQ) from day one? In-process is simpler to deploy but limits horizontal scaling.
4. **Plugin sandboxing mechanism:** V8 isolates (vm2/isolated-vm), WebAssembly, or separate Node.js worker threads? Each has different trade-offs for security, performance, and developer experience.
5. **Audit log storage:** Same PostgreSQL database as operational data vs. separate append-only store? Same database simplifies deployment; separate store (e.g., write-once S3 bucket) provides stronger tamper-evidence.
6. **Session management during IdP outages:** How long should cached sessions remain valid when the IdP is unreachable? Too short disrupts operations; too long creates a security window.
7. **Data residency routing:** Application-level query routing vs. PostgreSQL foreign data wrappers vs. separate API gateway routing? Each has different latency and complexity profiles.
