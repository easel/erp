# ADR-003: Monetary Value Representation — NUMERIC(19,6)

**Authority Level:** 4 (Design)
**Status:** Accepted
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md)

---

## Context

SD-001 (architecture) originally specified BIGINT with application-layer scaling for monetary values. SD-002 (data model) specified NUMERIC(19,6). These are fundamentally different approaches.

## Decision

Use **NUMERIC(19,6)** for all monetary amount columns in PostgreSQL. Every monetary column must be paired with a `currency_code VARCHAR(3)` column. Exchange rates use NUMERIC(18,10).

## Rationale

- NUMERIC(19,6) is the industry standard for financial systems — it provides exact decimal arithmetic without floating-point errors.
- 19 digits of precision with 6 decimal places handles all world currencies including those with 3-decimal subdivisions (KWD, BHD, OMR) plus sufficient precision for pro-rata calculations.
- BIGINT with application-layer scaling requires every application component to agree on the scale factor — a single bug means money amounts off by orders of magnitude.
- PostgreSQL's NUMERIC type handles arithmetic correctly at the database level (sums, averages in views/reports) without application intervention.
- Exchange rates at NUMERIC(18,10) provide sufficient precision for triangulated cross-currency conversions.

## Alternatives Considered

1. **BIGINT with scale** — eliminates floating point but pushes complexity to application layer, fragile.
2. **DOUBLE PRECISION** — unacceptable for financial data due to rounding errors.
3. **NUMERIC(15,2)** — insufficient for currencies with 3+ decimal places and for intermediate calculation precision.

## Consequences

Slightly larger storage than BIGINT. Application layer receives decimal strings from PostgreSQL, not integers. TypeScript must use string representation (not `number`) to avoid JavaScript floating-point issues. The shared `Money` type uses `amount: string`.

## Affected Artifacts

- SD-001 (already updated from BIGINT to NUMERIC(19,6))
