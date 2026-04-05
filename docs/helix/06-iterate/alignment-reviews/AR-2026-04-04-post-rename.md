# Alignment Review: AR-2026-04-04-post-rename

**Scope:** Post-rename, post-ADR-010/011, post-worker
**Date:** 2026-04-04
**Reviewer:** Claude Opus 4.6
**Previous review:** AR-2026-04-04-repo

---

## Summary

This is the second alignment review of the Apogee repository, run after the product rename (SatERP to Apogee), the addition of ADR-010 (Frontend Validation Architecture) and ADR-011 (ERP Component Library and Navigation), the addition of frontend acceptance criteria PLT-017/018/019 to FEAT-009, and helix worker implementation of 6 WP-0 tasks.

**Key metrics:**
- Planning artifacts: 22 documents (unchanged)
- Implementation files: 7 source files across 3 packages (unchanged in count; content improved)
- Open beads: 19 (5 P0, 7 P1, 3 P2, 2 P3, 2 P0 review-findings from fresh-eyes review)
- Closed beads: 13 (6 WP-0 bootstrap + 3 AR-1 findings resolved + 4 fresh-eyes findings resolved)
- Critical findings this review: 0
- High findings this review: 1
- Medium findings this review: 4
- Low findings this review: 3
- Informational: 3

**Overall assessment:** The rename is complete -- zero SatERP/saterp/@saterp references remain anywhere in the repo (excluding node_modules). ADR-010/011 are well-propagated into FEAT-009 and SD-001. The three most consequential findings from AR-1 (SD-001 monorepo layout, Vitest references, Redis optionality labeling) are resolved. Remaining open findings are tracked with beads and prioritized correctly. The main new findings concern stale naming in SD-003, the SD-001 audit table naming inconsistency, and the web package's missing Next.js dependency.

---

## Prior Finding Resolution

| AR-1 ID | Severity | Finding | Status | Evidence |
|---------|----------|---------|--------|----------|
| AR-001 | HIGH | SD-001 monorepo structure diverges from implementation (pnpm/Turborepo/apps+packages) | **RESOLVED** | SD-001 Section 4 now shows Bun workspace flat `packages/` layout. No pnpm, Turborepo, or eslint-plugin-boundaries references remain in SD-001. Bead erp-7bbbff0e is closed. |
| AR-002 | HIGH | SD-001 and SD-003 reference Vitest | **RESOLVED** | No Vitest or supertest references remain in SD-001 or SD-003. SD-001 Section 2 testing table now specifies `bun test`. SD-003 Section 7 references `bun test`. Bead erp-8454353a is closed. |
| AR-003 | HIGH | ADR-008 mandates Redis labeled optional; SD-001 and docker-compose missing labels | **PARTIALLY RESOLVED** | SD-001 diagram (line 63) labels Redis as "(optional, recommended)". docker-compose.yml has a comment block explaining Redis is optional and describing fallback behavior. However: (1) SD-001 readiness probe still treats Redis as a critical dependency (tracked as hx-117bfc44, open). (2) docker-compose.yml lacks explicit instructions for running without Redis (tracked as hx-de35f5c4, open). Bead erp-8028b91d was closed but these two follow-on findings remain open. |
| AR-004 | MEDIUM | MoneyAmountSchema regex allows unlimited integer digits | **OPEN** | Regex is still `/^\d+(\.\d{1,6})?$/` -- no 13-digit limit. Tracked as hx-97b53176 (open, P0). |
| AR-005 | MEDIUM | MoneyInput negative amount support vs schema | **OPEN** | No change. MoneyAmountSchema still rejects negatives. ADR-011 still states MoneyInput "supports negative amounts." No ADR-003 addendum has been written. No bead exists for this specific issue. |
| AR-006 | MEDIUM | SD-003 lists Mailpit in docker-compose; actual has none | **OPEN** | SD-003 WP-0 line 35 still reads: "docker-compose for PostgreSQL 16, Redis 7, Mailpit". docker-compose.yml has no Mailpit service. No bead exists. |
| AR-007 | MEDIUM | Server package has no entrypoint | **OPEN** | `packages/server/src/index.ts` still exports only; no Fastify listen call. Tracked as hx-9164fdf4 (open, P0). |
| AR-008 | MEDIUM | WP-0 auth scaffolding and observability baseline have no explicit beads | **OPEN** | No new beads created for these. WP-0 bead (erp-94776bff) is still open. Auth scaffolding and observability remain untracked individually. |
| AR-009 | LOW | SD-001 references Kysely; no dependency yet | **OPEN (expected)** | No Kysely dependency in package.json. Expected -- WP-1 has not started. |
| AR-010 | LOW | SD-001 references @fastify/swagger; not in package.json | **OPEN (expected)** | Same as AR-009. Expected before WP-1. |
| AR-011 | LOW | SD-001 references Playwright and Vitest+supertest for E2E/API testing | **RESOLVED** | Vitest and supertest references removed from SD-001. Playwright reference remains correctly as the future E2E framework (WP-7). |
| AR-012 | LOW | SD-001 references eslint-plugin-boundaries | **RESOLVED** | No eslint-plugin-boundaries reference in SD-001. Module boundary enforcement now references "Biome rules" (line 329). |
| AR-013-017 | INFO | Various informational findings | **N/A** | No action was required. |

**Summary:** Of 12 actionable findings from AR-1, 5 are resolved, 2 are partially resolved (with follow-on beads), and 5 remain open. The 3 HIGH findings are all resolved or have follow-on tracking. The open items are being tracked in the bead system.

---

## New Findings

### NF-001: SD-003 WP-0 references `@apogee/kernel` but package is `@apogee/shared` (MEDIUM)

**Location:** `docs/helix/02-design/solution-designs/SD-003-phase1-implementation-plan.md`, line 38

SD-003 WP-0 deliverable table says: `@apogee/kernel -- base types, Result/Error types, audit context, pagination primitives`. The actual implementation uses `@apogee/shared` as the package name. This naming drift was introduced before the first review but was not caught. A contributor reading SD-003 would expect a `@apogee/kernel` package that does not exist.

**Resolution:** Update SD-003 line 38 to reference `@apogee/shared` instead of `@apogee/kernel`.

---

### NF-002: SD-001 uses `audit_log` table name; ADR-004 mandates `audit_entry` (MEDIUM)

**Location:** `docs/helix/02-design/solution-designs/SD-001-system-architecture.md`, lines 481, 517, 928, 995

ADR-004 explicitly resolves the naming conflict: "Table name: `audit_entry` (not `audit_log`)." SD-002 uses `audit_entry` throughout. However, SD-001 still uses `audit_log` in four places:
- Line 481: `CREATE TABLE audit_log (...)`
- Line 517: "The `audit_log` table has no UPDATE or DELETE permissions"
- Line 928: `audit_log: Range-partitioned by month`
- Line 995: `audit_log_entries_total` (metric name -- this one may be intentionally different as a metric name)

ADR-004's "Affected Artifacts" section states: "SD-001's DDL example should be updated or removed to avoid confusion."

**Resolution:** Rename `audit_log` to `audit_entry` in SD-001 lines 481, 517, and 928. The metric name on line 995 (`audit_log_entries_total`) can remain as-is since metric naming conventions differ from table naming.

---

### NF-003: SD-003 WP-0 still lists Mailpit in docker-compose deliverable (LOW)

**Location:** `docs/helix/02-design/solution-designs/SD-003-phase1-implementation-plan.md`, line 35

This was AR-006 from the first review and remains unresolved. SD-003 says docker-compose includes "PostgreSQL 16, Redis 7, Mailpit" but actual docker-compose.yml has no Mailpit service. Since email notifications are a WP-1+ concern, the simplest fix is updating SD-003 to remove Mailpit from the WP-0 deliverable list.

**Resolution:** Remove "Mailpit" from SD-003 line 35 or add a Mailpit service to docker-compose.yml.

---

### NF-004: Web package lists Next.js scripts but has no Next.js dependency (HIGH)

**Location:** `packages/web/package.json`

The `@apogee/web` package.json defines `next dev`, `next build`, and `next start` scripts but has no `next`, `react`, or `react-dom` in its dependencies. Running any of these scripts will fail immediately. This was noted as AR-017 (INFO) in the first review but should be elevated now that ADR-011 has formalized the Next.js App Router architecture and PLT-019 has acceptance criteria for navigation.

Two options:
1. Add `next`, `react`, `react-dom` as dependencies now (preferred -- validates the package can be built).
2. Remove the Next.js scripts until web development begins and replace with a no-op build.

**Resolution:** Either add Next.js dependencies or remove the scripts. Leaving broken scripts in package.json is a contributor trap.

---

### NF-005: No bead for negative money amount design question (LOW)

**Location:** ADR-011 MoneyInput spec vs `MoneyAmountSchema` in `packages/shared/src/schemas.ts`

AR-005 from the first review identified that ADR-011 says MoneyInput "supports negative amounts (credits, adjustments)" but MoneyAmountSchema only accepts non-negative values. This remains unresolved and has no tracking bead. The design question needs an explicit decision: either the schema should support negatives, or ADR-011 should document that amounts are stored unsigned with a separate debit/credit indicator.

**Resolution:** Create a bead to track this design decision. Clarify in ADR-003 addendum or ADR-011 whether `Money.amount` can be negative.

---

### NF-006: ADR-010/011 propagation to SD-001 and SD-003 is complete (INFO)

SD-001 Section 2 Frontend table already references: React 19, Next.js 15 (App Router), shadcn/ui, Radix, TanStack Table 8, React Hook Form + Zod. This aligns with ADR-011.

SD-001 Section 2 Validation row references Zod shared between API and frontend. This aligns with ADR-010.

FEAT-009 has PLT-017 (Frontend Validation Architecture), PLT-018 (Domain-Specific ERP Components), and PLT-019 (Navigation Architecture) with detailed acceptance criteria tracing to ADR-010 and ADR-011. All PLT-017/018/019 requirements are covered.

No gaps found in ADR-010/011 propagation.

---

### NF-007: Frontend beads cover PLT-017/018/019 requirements (INFO)

Three open beads map to the new PLT requirements:
- `erp-b840be26` (Frontend validation architecture) covers PLT-017 (ADR-010)
- `erp-d4539b96` (Domain component library) covers PLT-018 (ADR-011 components)
- `erp-9be0b180` (Navigation architecture) covers PLT-019 (ADR-011 navigation)

All three are P1, tagged with `helix,wp-1,platform,frontend`. This is correct -- these are WP-1 deliverables that build on WP-0.

No orphaned or missing beads for PLT-017/018/019.

---

### NF-008: Bun ecosystem compliance is strong (INFO)

Searched all non-node_modules files for npm/pnpm references. Results:
- Zero `npm run` or `pnpm run` references in source code, configs, or CI.
- CI workflow uses `bun install --frozen-lockfile` and `bun run` throughout.
- All package.json scripts use `bun test`, `bun run`, etc.
- AGENTS.md correctly documents Bun as the runtime and package manager.
- .env.example, docker-compose.yml, and Dockerfile.migrate all use `bun`.
- No Vitest, Jest, or other non-Bun test runners referenced (outside node_modules).

One minor note: the ci-node job uses `bun install` and `bun run lint` even though it's the "Node.js LTS" job. This is intentional and documented in the CI workflow comments -- Node.js is only validated for lint/typecheck portability, not as a complete runtime alternative.

---

### NF-009: Tracker health assessment (MEDIUM)

**Bead inventory:** 19 open, 13 closed. No orphaned beads found.

**P0 specs without beads:**
- WP-0 authentication scaffolding (Keycloak dev instance) -- still no individual bead (AR-008 repeat)
- WP-0 observability baseline (structured logging, OpenTelemetry) -- still no individual bead (AR-008 repeat)

**Questionable bead states:**
- `hx-5ea9e9b8` (missing tests for 404/error/GraphQL) was listed as open in AR-1 but is now closed. The tests exist in `packages/server/test/routes.test.ts` -- verified, correctly closed.
- `hx-4dad2691` (ci-node not testing Node.js runtime) is closed. The CI workflow now has clear documentation that Node.js testing is lint/typecheck only, with true runtime testing tracked in `hx-708ffd56` (open). Correctly closed.

**Fresh-eyes review findings (new since AR-1):**
- `hx-117bfc44` (SD-001 readiness probe contradicts Redis-optional) -- open, P0. Verified: SD-001 line 1015 still says "Checks Redis connectivity (PING)" without conditional qualifier.
- `hx-de35f5c4` (docker-compose missing run-without-Redis instructions) -- open, P0. Verified: no such instructions exist.

Both fresh-eyes findings are valid and correctly tracked.

---

### NF-010: SD-003 WP-1 Definition of Done references `@apogee/platform` package (LOW)

**Location:** `docs/helix/02-design/solution-designs/SD-003-phase1-implementation-plan.md`, line 85

SD-003 WP-1 Definition of Done says: "Platform SDK package (`@apogee/platform`) is published." The current monorepo has `@apogee/shared`, `@apogee/server`, and `@apogee/web` -- no `@apogee/platform`. Either this package will be created during WP-1, or the reference is stale (like `@apogee/kernel`).

Since WP-1 hasn't started, this is speculative. However, the SD-001 module architecture diagram (Section 4) shows a `platform` module in the dependency tree. If WP-1 creates `@apogee/platform` as a separate package, this is fine. If platform code goes into `@apogee/server`, the DoD reference needs updating.

**Resolution:** Verify during WP-1 planning whether `@apogee/platform` will be a separate package. If not, update SD-003 WP-1 DoD.

---

## Finding Summary Table

| ID | Severity | Area | Finding | Resolution |
|----|----------|------|---------|------------|
| NF-001 | MEDIUM | SD-003 vs Implementation | SD-003 WP-0 references `@apogee/kernel`; actual package is `@apogee/shared` | Update SD-003 line 38 |
| NF-002 | MEDIUM | SD-001 vs ADR-004 | SD-001 uses `audit_log` table name in 4 places; ADR-004 mandates `audit_entry` | Rename in SD-001 lines 481, 517, 928 |
| NF-003 | LOW | SD-003 vs Implementation | SD-003 WP-0 still lists Mailpit; docker-compose has no Mailpit | Remove Mailpit from SD-003 or add to docker-compose |
| NF-004 | HIGH | Implementation | Web package has Next.js scripts but no Next.js dependency; scripts will fail | Add Next.js deps or remove scripts |
| NF-005 | LOW | ADR-011 vs Implementation | Negative money amount design question unresolved and untracked | Create bead; clarify in ADR-003 or ADR-011 |
| NF-006 | INFO | ADR-010/011 propagation | ADR-010/011 fully reflected in SD-001, FEAT-009 PLT-017/018/019 | No action needed |
| NF-007 | INFO | Tracker coverage | Frontend beads correctly cover PLT-017/018/019 | No action needed |
| NF-008 | INFO | Bun ecosystem | No stale npm/pnpm/Vitest/supertest references; Bun-native throughout | No action needed |
| NF-009 | MEDIUM | Tracker health | WP-0 auth scaffolding and observability still lack individual beads | Create beads or update SD-003 to defer to WP-1 |
| NF-010 | LOW | SD-003 | WP-1 DoD references `@apogee/platform` package that may not be created | Verify during WP-1 planning |

---

## Recommended Actions

### Priority 1 (Before next work session)

1. **Fix SD-003 `@apogee/kernel` reference** (NF-001): Change to `@apogee/shared` on line 38. This is a one-line documentation fix that prevents contributor confusion.

2. **Fix SD-001 `audit_log` table name** (NF-002): Rename to `audit_entry` on lines 481, 517, 928 per ADR-004. The ADR explicitly calls this out as a required update.

3. **Resolve web package broken scripts** (NF-004): Either add `next`, `react`, `react-dom` dependencies to `packages/web/package.json` or replace the scripts with no-ops. Current state is a contributor trap.

### Priority 2 (During WP-1 planning)

4. **Remove Mailpit from SD-003 or add to docker-compose** (NF-003/AR-006): Simplest fix is removing it from SD-003 since email is not a WP-0 concern.

5. **Create bead for negative money design question** (NF-005): Track the ADR-011 vs MoneyAmountSchema conflict explicitly.

6. **Resolve WP-0 auth/observability bead gap** (NF-009/AR-008): Decide whether these belong in WP-0 or WP-1 and create beads or update SD-003 accordingly.

7. **Resolve existing P0 findings** (from AR-1 and fresh-eyes review):
   - hx-97b53176: Fix MoneyAmountSchema 13-digit integer limit
   - hx-9164fdf4: Add server entrypoint
   - hx-117bfc44: Fix SD-001 readiness probe Redis conditionality
   - hx-de35f5c4: Add run-without-Redis instructions to docker-compose
   - hx-708ffd56: True Node.js runtime test execution

### Priority 3 (Before WP-2)

8. **Verify `@apogee/platform` package plan** (NF-010): During WP-1, confirm whether platform code gets its own package or lives in `@apogee/server`.
