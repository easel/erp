# ADR-002: Primary Key Strategy — UUID v4

**Authority Level:** 4 (Design)
**Status:** Accepted
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md)

---

## Context

SD-001 (architecture) originally specified ULIDs for sortability and URL-safety. SD-002 (data model) specified UUIDs. The two docs disagreed. Both are valid choices.

## Decision

Use **UUID v4** as the standard primary key type across all tables. Use PostgreSQL's `gen_random_uuid()` for generation.

## Rationale

- UUID v4 has universal ecosystem support in PostgreSQL, Node.js, ORMs (Kysely, Prisma, etc.), and every client library.
- ULIDs require additional libraries and have less mature PostgreSQL support.
- Sortability is handled by `created_at` indexed columns where needed, not by PK ordering.
- UUID v4 avoids information leakage about creation order (relevant for ITAR-sensitive records).
- The data model (SD-002) is the authoritative schema document and already uses UUID.

## Alternatives Considered

1. **ULIDs** — better sortability but weaker ecosystem support.
2. **UUID v7** — sortable UUIDs, but PostgreSQL 16 doesn't natively generate them.
3. **BIGSERIAL** — information leakage, sharding difficulties.

## Consequences

PKs are not naturally sortable. Queries that need creation-order sorting must use `created_at`. This is standard practice for financial systems.

## Affected Artifacts

- SD-001 (already updated from ULID to UUID)
