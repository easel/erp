# ADR-007: Fiscal Period Close State Model

**Authority Level:** 4 (Design)
**Status:** Accepted
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md)

---

## Context

SD-002 defines `fiscal_period.status` with values `OPEN, CLOSED, ADJUSTMENT`. FEAT-001 acceptance criteria FIN-002 specifies "soft-close" (allows only adjusting entries) and "hard-close" (prevents all postings). The data model doesn't support the three-state progression described in the feature spec.

## Decision

Fiscal period status uses a **four-state model**:

- `FUTURE` — period exists but is not yet open for posting.
- `OPEN` — normal posting allowed.
- `SOFT_CLOSED` — only journal entries marked as `is_adjusting = true` are accepted; regular postings are rejected.
- `HARD_CLOSED` — no postings of any kind are accepted; period is locked for audit.

State transitions are strictly ordered: `FUTURE -> OPEN -> SOFT_CLOSED -> HARD_CLOSED`. Reverse transitions require an explicit "reopen" action with audit trail and approval workflow. The separate `period_status` table in SD-002 should be removed — status belongs directly on `fiscal_period`.

## Rationale

The four-state model matches standard month-end close procedures: (1) open for business, (2) preliminary close where only auditor adjustments are allowed, (3) final close. This is what controllers expect from an ERP. The `FUTURE` state prevents accidental posting to periods that haven't started. Database-level enforcement (CHECK constraint + trigger on `journal_entry` INSERT) ensures postings cannot bypass period controls.

## Alternatives Considered

1. **Three states (OPEN/CLOSED/ADJUSTMENT)** — conflates "closed but adjustable" with a separate adjustment concept.
2. **Boolean flags (is_open, is_adjustable)** — allows invalid combinations.
3. **Period locking via separate lock table** — over-complex for a simple state machine.

## Consequences

SD-002's `fiscal_period.status` enum needs updating to four values. The separate `period_status` table should be removed or repurposed. `journal_entry` INSERT trigger must check period status and entry type. Controllers gain clear audit trail of who closed/reopened each period.

## Affected Artifacts

- SD-002 (update fiscal_period.status enum, remove period_status table)
- FEAT-001 (open question resolved)
