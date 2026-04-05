# ADR-001: Classification Inheritance Policy

**Authority Level:** 4 (Design)
**Status:** Accepted
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md)

---

## Context

SD-003 (implementation plan) originally hardcoded "assembly inherits highest child classification" for ITAR/EAR. FEAT-006 (export control spec) explicitly left this as an open design question pending ITAR counsel review. Classification inheritance has serious legal implications — getting it wrong can mean criminal ITAR violations.

## Decision

Phase 1 implements **explicit classification only**. Every inventory item, assembly, and product must be individually classified by a trained compliance officer. No automatic inheritance. This question remains open pending counsel review; automatic inheritance may be added in a future phase once legal guidance is obtained.

## Rationale

The risk of automatically misclassifying an ITAR-controlled item is too high for a default rule. Explicit classification is always legally defensible. Automatic inheritance is a convenience optimization, not a compliance requirement.

## Alternatives Considered

1. **Highest-child inheritance** — rejected as legally premature.
2. **Lowest-child inheritance** — nonsensical for export control.
3. **Configurable rule** — deferred, too complex without legal framework.

## Consequences

More manual work for compliance officers in Phase 1. Every BOM change requires classification review. But zero risk of automated misclassification.

## Affected Artifacts

- SD-003 (already updated)
- FEAT-006 (open question remains)
