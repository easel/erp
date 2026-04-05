# ADR-009: Isomorphic TypeScript on Bun with Local-First Architecture

**Authority Level:** 4 (Design)
**Status:** Accepted
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md)

---

## Context

The original technology stack decision specified "TypeScript + Node.js" for backend and frontend. As design progresses, three architectural patterns have been identified as critical for SatERP's deployment model and developer experience:

1. **Isomorphic TypeScript** — Sharing validation logic, domain types, and business rules between server and client eliminates an entire class of bugs where frontend and backend disagree on data shape, validation rules, or computation (e.g., currency rounding, compliance checks). For an ERP handling ITAR-regulated transactions, correctness parity between client and server is a compliance concern, not just a convenience.

2. **Bun runtime** — SatERP is self-hosted in environments ranging from GovCloud to air-gapped facilities. Bun provides a single binary runtime with built-in TypeScript execution, bundling, testing, and package management — reducing deployment complexity and dependency surface area. Its performance characteristics (faster startup, lower memory, native SQLite for local state) are well-suited to self-hosted ERP workloads.

3. **Local-first architecture** — Satellite operators work from ground stations, field offices, and conflict zones where network connectivity is unreliable or intermittent. A local-first approach ensures the system remains functional when disconnected, syncing state when connectivity returns. This directly supports PRD constraint C5 ("no external network dependencies for core functions").

## Decision

SatERP adopts the following architectural approach:

### Isomorphic TypeScript
- **Shared packages** contain domain types, validation schemas (Zod), business rule functions, and computation logic (currency math, compliance checks, tax calculations).
- The same validation code runs on both client and server. Server-side validation is authoritative; client-side validation is for UX responsiveness.
- Shared packages are pure TypeScript with no platform-specific dependencies (no `fs`, no `window`).

### Bun Runtime
- **Bun** replaces Node.js as the server-side runtime.
- Bun's built-in features replace external tools: `bun test` for testing, `bun build` for bundling, `bun install` for package management.
- The application must remain compatible with Node.js as a fallback for environments where Bun cannot be deployed (verified by CI running tests on both runtimes).
- Bun's native SQLite support is used for local-first client state (see below).

### Local-First Architecture
- **Client-side state** is persisted in SQLite (via Bun's native SQLite or sql.js in the browser) for offline operation.
- **Conflict resolution** uses a last-write-wins (LWW) strategy for most entities, with explicit merge UIs for conflict-prone records (journal entries, compliance decisions).
- **Sync protocol** uses a CRDT-inspired event log: clients record mutations locally, then push/pull against the server when connected. The server is the source of truth for committed transactions.
- **Offline capabilities** are tiered:
  - **Tier 1 (always offline-capable):** Read access to recently-synced data, draft creation (quotes, POs, activities), compliance screening against locally-cached screening lists.
  - **Tier 2 (requires eventual sync):** Order submission, invoice creation, journal entry posting — created locally, committed on sync.
  - **Tier 3 (online-only):** Real-time denied-party screening against live lists, payment execution, report generation against full dataset.
- **PostgreSQL** remains the server-side source of truth. Local-first does not replace PostgreSQL — it extends the system to work offline with SQLite as the local store.

### PostgreSQL as Default Datastore
- PostgreSQL 16 remains the canonical server-side database (already established in SD-001 and SD-002).
- This ADR reinforces that PostgreSQL is not optional — it is the required server-side datastore.

## Rationale

| Choice | Why |
|--------|-----|
| Isomorphic TS | ERP validation bugs are expensive (incorrect invoices, compliance gaps). Shared code eliminates client/server divergence. One type system from database to UI. |
| Bun over Node.js | Single-binary deployment simplifies air-gapped installs. Built-in TypeScript eliminates transpilation step. Native SQLite enables local-first without additional dependencies. Faster cold starts for self-hosted environments. |
| Local-first | Satellite operators in conflict zones (Ukraine, Israel) and remote ground stations cannot depend on continuous connectivity. An ERP that stops working when the network drops is unacceptable for field operations. |
| PostgreSQL | Battle-tested for financial data, ACID compliance, row-level security for ITAR compartmentalization, and the advanced query capabilities needed for consolidation and reporting. Not negotiable. |

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Node.js (original choice) | Requires separate TypeScript compilation, lacks native SQLite, larger deployment footprint. Retained as fallback runtime for compatibility. |
| Deno | Strong TypeScript support but smaller ecosystem, less mature SQLite story, limited enterprise adoption. |
| Server-only (no local-first) | Fails PRD constraint C5 for disconnected environments. Field personnel in conflict zones would lose access during network outages. |
| CouchDB/PouchDB for local-first | Adds a second database technology. PostgreSQL + SQLite (via Bun) keeps the stack simpler. |
| Full CRDT (Automerge/Yjs) | Over-engineered for ERP data where most writes are non-concurrent. LWW with explicit merge UI is sufficient and much simpler. |

## Consequences

### Positive
- Single language and type system from database types through API through UI
- Offline-capable field operations in conflict zones and remote sites
- Simplified deployment (single Bun binary + PostgreSQL)
- Faster development iteration (no transpile step, built-in test runner)
- Shared validation means compliance checks are identical on client and server

### Negative
- Bun is younger than Node.js — fewer production references, potential edge cases
- Node.js fallback requirement means avoiding Bun-only APIs in shared code
- Local-first sync adds complexity to every write path (local commit → sync → conflict resolution)
- SQLite schema must mirror a subset of PostgreSQL schema — migration coordination required
- Offline compliance screening against cached lists may have stale data — Tier 3 boundary must be clearly enforced

### Risks
- **Bun stability:** Mitigated by Node.js fallback and CI testing on both runtimes
- **Sync conflicts on financial data:** Mitigated by making Tier 2 operations (journal entries, invoices) require eventual sync confirmation — they are "pending" until server acknowledges
- **Stale screening lists offline:** Mitigated by Tier 3 classification — live screening is online-only; offline screening uses cached lists with a staleness warning after configurable threshold (default: 24 hours)

## Affected Artifacts

| Artifact | Change Required |
|----------|----------------|
| Product Vision | Update technology stack from "Node.js" to "Bun" |
| PRD (Constraint C5) | Already aligns — local-first strengthens offline capability |
| SD-001 (Architecture) | Update runtime, add local-first sync layer, add SQLite client-side |
| SD-002 (Data Model) | Add sync metadata columns (sync_version, last_synced_at) to offline-capable tables |
| SD-003 (Implementation Plan) | Add local-first infrastructure to WP-0/WP-1 |
| FEAT-009 (Platform) | Add acceptance criteria for offline operation and sync |

---

*This ADR supersedes the original "TypeScript + Node.js" technology stack decision in the Product Vision resolved decisions section.*
