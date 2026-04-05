# ADR-006: Compliance Status Enforcement Mechanism

**Authority Level:** 4 (Design)
**Status:** Accepted
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md)

---

## Context

SD-001 (architecture, Section 7) states that transactional entities must have a `compliance_status` column with a CHECK constraint, values `cleared` or `held`. However, SD-002 (data model) does not include this column on any transactional table (`sales_order`, `purchase_order`, `shipment`). The PRD constraint C4 states "Export compliance checks cannot be bypassed or disabled."

## Decision

Enforce compliance via a **`compliance_status` column on all compliance-gated transactional tables** with a database-level CHECK constraint:

Tables that get `compliance_status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (compliance_status IN ('pending', 'cleared', 'held'))`:

- `sales_order`
- `purchase_order`
- `shipment`
- `quote` (screening on quote creation catches issues early)

Additionally:

- A database trigger prevents any row with `compliance_status = 'pending'` from transitioning to fulfillment/shipping states.
- A database trigger prevents any row with `compliance_status = 'held'` from transitioning to any forward state.
- Only the ComplianceService (via a dedicated database role) can update `compliance_status` from `pending` to `cleared`.
- The application cannot bypass this — it is enforced at the database level.

## Rationale

The cannot-bypass constraint (PRD C4) requires database-level enforcement, not just application-level checks. A CHECK constraint + trigger approach means even direct SQL access cannot advance a non-compliant transaction. This is the strongest enforcement mechanism available without external hardware.

## Alternatives Considered

1. **Application-only enforcement** — bypassable via direct DB access, insufficient for ITAR.
2. **Separate compliance_hold table with FK** — weaker enforcement, doesn't prevent state transitions.
3. **Row-level security policy** — RLS is for visibility, not workflow enforcement.

## Consequences

Every compliance-gated table gains a column and trigger. The ComplianceService must run with a specific database role. Migration complexity increases slightly. But: it is physically impossible to ship an unscreened order, which is the correct behavior for ITAR compliance.

## Affected Artifacts

- SD-002 (add column to 4 tables + triggers)
- SD-001 (already describes this intent)
