# ADR-008: Redis Optionality

**Authority Level:** 4 (Design)
**Status:** Accepted
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md)

---

## Context

SD-001 states Redis is "optional, recommended" for core operations, aligning with PRD constraint C5 (no external network dependencies for core functions). However, the architecture diagram shows Redis as a primary data layer component, and deployment configs include it in all environments. The messaging is contradictory.

## Decision

Redis is **recommended but not required**. The system must function fully without Redis. When Redis is available, it provides:

- Session caching (fallback: PostgreSQL-backed sessions)
- Rate limiting (fallback: in-memory per-process with PostgreSQL coordination)
- Frequently-accessed reference data cache (fallback: application-level LRU cache)
- Background job coordination (fallback: Graphile Worker already uses PostgreSQL)

Architecture and deployment docs should clearly label Redis as "optional enhancement" in all diagrams and configs, with documented fallback behavior for each use case.

## Rationale

PRD constraint C5 requires no external network dependencies for core functions. Some deployment environments (air-gapped, minimal infrastructure) may not have Redis available. PostgreSQL can serve all Redis use cases at lower throughput — acceptable for the target scale (50 entities, 10K contracts). Redis becomes valuable at higher scale or when sub-millisecond cache hits matter.

## Alternatives Considered

1. **Redis required** — violates C5 for minimal deployments.
2. **Redis removed entirely** — loses legitimate performance benefits for operators who can run it.
3. **Embedded cache only (no Redis option)** — misses the distributed caching benefit for multi-node deployments.

## Consequences

Every Redis usage must have a PostgreSQL or in-memory fallback. This adds implementation complexity to the caching and session layers. Deployment docs need "with Redis" and "without Redis" configurations. Performance testing should cover both modes.

## Affected Artifacts

- SD-001 (clarify Redis optionality in diagram and text)
- SD-003 (WP-0/WP-1 should include fallback implementation)
