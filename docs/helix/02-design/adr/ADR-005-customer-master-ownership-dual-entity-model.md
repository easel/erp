# ADR-005: Customer Master Ownership — Dual Entity Model

**Authority Level:** 4 (Design)
**Status:** Accepted
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md)

---

## Context

FEAT-003 (Sales) and FEAT-004 (CRM) both flag "who owns the customer master?" as an open design question. SD-002 (data model) implicitly resolves this by having separate `customer` (Sales schema) and `crm_company` (CRM schema) tables with a `customer_id` FK on `crm_company`. But this design decision was never explicitly documented.

## Decision

Apogee uses a **dual-entity model**:

- `customer` table (Sales schema) — the financial/transactional customer record. Owns billing addresses, payment terms, credit limits, tax IDs, and currency preferences. This is the entity referenced by quotes, sales orders, invoices, and AR.
- `crm_company` table (CRM schema) — the relationship/engagement record. Owns pipeline, activities, opportunities, campaigns, and health scores. Links to `customer` via optional FK.
- A `crm_company` can exist without a `customer` record (prospect/lead stage).
- A `customer` record is created when a `crm_company` first places an order or is manually promoted.
- The `crm_company.customer_id` FK is the join point. It is set once and never changes.

## Rationale

Satellite operators have long sales cycles (6-18 months). Prospects exist in CRM long before they become financial customers. Forcing a financial `customer` record at lead stage pollutes AR/financial reporting. Conversely, the CRM record needs relationship data (activities, pipeline) that doesn't belong in the financial customer master. The dual model keeps each domain clean.

## Alternatives Considered

1. **Single unified table** — mixes financial and CRM concerns, forces creation of financial records for prospects.
2. **CRM owns customer, Sales references it** — wrong authority direction; financial records should not depend on CRM schema.
3. **Shared kernel entity** — over-engineering for the actual access patterns.

## Consequences

Implementers must understand which entity to use in which context. Quote/order/invoice always reference `customer`. Pipeline/activity/campaign always reference `crm_company`. The promotion workflow (crm_company -> customer) must be well-documented. Reports that span both domains join on `crm_company.customer_id`.

## Affected Artifacts

- FEAT-003 (open question resolved)
- FEAT-004 (open question resolved)
- SD-002 (already implements this model)
