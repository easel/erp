# Gap Analysis: Acceptance Criteria → Playwright Test Coverage

**Date:** 2026-04-09  
**Type:** Test Coverage Gap Analysis  
**Triggered by:** User inquiry on feature test coverage completeness  
**Status:** Beads created, work in progress  

---

## Executive Summary

Analysis reveals **~120+ user stories across Phase 1 features lack browser-driven acceptance criteria verification via Playwright tests**. While the codebase has excellent unit/integration test coverage (934 passing tests), these verify API correctness—not the actual USER EXPERIENCE through which end users interact with the system.

### Key Findings

| Metric | Count |
|--------|-------|
| Total Phase 1 User Stories | ~147 |
| Currently Covered by Playwright | ~25 (basic navigation + auth) |
| Missing Playwright Tests | **~120+** |
| Compliance-Critical Gaps | 10+ (FEAT-006 Export Control) |

### Why This Matters

1. **Users interact through UI, not GraphQL** - Bugs in forms, navigation, data display only surface in browser tests
2. **Acceptance criteria are user-centric** - They describe what users should be able to DO, not just that APIs work
3. **Compliance requirements demand it** - ITAR/EAR screening, audit trails, and financial controls must be verified end-to-end

---

## Detailed Gap Analysis by Feature

### FEAT-001: Financial Management (43 user stories)

**Coverage:** ~5 of 43 covered  
**Gap:** 38 missing tests  

| User Story | Acceptance Criteria | Test Status | Bead ID |
|------------|---------------------|-------------|---------|
| As a controller, maintain separate COAs per entity | FIN-001 | ❌ Missing | apogee-9a5d8fc3 |
| As an AP clerk, enter vendor bills with 3-way matching | FIN-003 | ❌ Missing | apogee-9682c724 |
| As an AR clerk, apply payments to open invoices | FIN-004 | ❌ Missing | apogee-6e894489 |
| As a revenue accountant, define performance obligations | FIN-006 | ❌ Missing | TBD |
| As a tax analyst, configure VAT/GST rates per jurisdiction | FIN-007 | ❌ Missing | TBD |

**Epic:** apogee-a9db0b89 (parent: apogee-73257382)

---

### FEAT-002: Procurement & Supply Chain (22 user stories)

**Coverage:** ~3 of 22 covered  
**Gap:** 18 missing tests  

| User Story | Acceptance Criteria | Test Status | Bead ID |
|------------|---------------------|-------------|---------|
| As a procurement manager, configure multi-step approval workflows | SCM-001 | ❌ Missing | apogee-9adc910e |
| As an AP clerk, match vendor invoices with 3-way matching | SCM-001 | ❌ Missing | apogeg-9682c724 |
| As a compliance officer, block POs for non-cleared vendors | SCM-002 | ❌ Missing | apogee-b5def64b |
| As a warehouse operator, assign lot/serial numbers to received items | SCM-003 | ❌ Missing | TBD |

**Epic:** apogee-abe7afc8 (parent: apogee-73257382)

---

### FEAT-003: Sales & Commercial (~15 user stories)

**Coverage:** ~2 of 15 covered  
**Gap:** 12 missing tests  

| User Story | Acceptance Criteria | Test Status | Bead ID |
|------------|---------------------|-------------|---------|
| As a sales analyst, create quotes with multiple line items | SLS-001 | ❌ Missing | apogee-af4c2f34 |
| As a sales manager, approve quotes exceeding discount thresholds | SLS-001 | ❌ Missing | apogee-af4c2f34 |
| As a billing analyst, generate invoices from contract milestones | SLS-002 | ❌ Missing | TBD |

**Epic:** apogee-84f47326 (parent: apogee-73257382)

---

### FEAT-004: Customer Relationship (~12 user stories)

**Coverage:** ~1 of 12 covered  
**Gap:** 8 missing tests  

| User Story | Acceptance Criteria | Test Status | Bead ID |
|------------|---------------------|-------------|---------|
| As an account manager, map company relationships (parent/child/partner) | CRM-001 | ❌ Missing | TBD |
| As a sales rep, log activities against contacts and opportunities | CRM-001 | ❌ Missing | apogee-ec5da06e |

**Epic:** apogee-22d921b0 (parent: apogee-73257382)

---

### FEAT-006: Export Control & Sanctions (~15 user stories) 🔴 HIGH PRIORITY

**Coverage:** ~4 of 15 covered  
**Gap:** 10 missing tests  

| User Story | Acceptance Criteria | Test Status | Bead ID |
|------------|---------------------|-------------|---------|
| As a product manager, assign USML/ECCN classification to products | EXP-001 | ❌ Missing | apogee-09ee4a0c |
| As a compliance officer, review denied-party screening queue matches | EXP-003 | ❌ Missing | apogee-cc833b0e |
| As a sales rep, verify automatic screening on order creation | EXP-002 | ⚠️ Partial | TBD |

**Epic:** apogee-1fce28ab (parent: apogee-73257382)  
**Priority:** 1 (Compliance-critical)

---

### FEAT-009: Platform Infrastructure (~22 user stories)

**Coverage:** ~5 of 22 covered  
**Gap:** 15 missing tests  

| User Story | Acceptance Criteria | Test Status | Bead ID |
|------------|---------------------|-------------|---------|
| As a system admin, enforce MFA for all users or by role | PLT-001 | ❌ Missing | apogee-20db56ef |
| As an auditor, search and filter audit logs by user/action/timestamp/entity | PLT-001 | ❌ Missing | apogee-798c7a13 |

**Epic:** apogee-758b72c1 (parent: apogee-73257382)

---

## Out of Scope (Phase 2)

| Feature | User Stories | Status |
|---------|--------------|--------|
| FEAT-005 Orbital Asset Management | ~8 | Deferred per SD-003 |
| FEAT-008 Program Management | ~8 | Deferred per SD-003 |

---

## Test Structure Standard

All new Playwright tests must follow this pattern:

```typescript
test.describe("FEAT-XXX: [Feature Name]", () => {
  test("[US-ID] As a [role], I want to [action] so that [benefit]", async ({ page }) => {
    // Given: preconditions (seeded data, logged-in user with role)
    await login(page, "controller@example.com");
    
    // When: user performs action through UI
    await page.goto("/finance/accounts");
    await page.click('button:has-text("New Account")');
    await page.fill('input[name="accountCode"]', "1000-0001");
    await page.click('button[type="submit"]');
    
    // Then: verify outcome matches acceptance criteria
    await expect(page.locator('[data-testid="account-row-1000-0001"]')).toBeVisible();
  });
});
```

### Test File Organization

```
tests/e2e/
├── 00-ui-reel.spec.ts          # Existing: 23 scenes (navigation + basic CRUD)
├── 01-auth.spec.ts             # Existing: Authentication flows
├── 02-modules.spec.ts          # Existing: Basic module navigation
├── 03-compliance.spec.ts       # Existing: Compliance screening
├── 04-entity-switching.spec.ts # Existing: Multi-entity context
├── 05-trial-balance.spec.ts    # Existing: Financial reporting
├── finance/
│   ├── coa-management.spec.ts  # NEW: Chart of Accounts (apogee-9a5d8fc3)
│   └── payment-application.spec.ts  # NEW: AR payments (apogee-6e894489)
├── procurement/
│   ├── po-workflow.spec.ts     # NEW: PO approvals (apogee-9adc910e)
│   └── three-way-match.spec.ts # NEW: Invoice matching (apogee-9682c724)
├── sales/
│   └── quote-workflow.spec.ts  # NEW: Quote creation/approval (apogee-af4c2f34)
├── compliance/
│   ├── product-classification.spec.ts  # NEW: EXP-001 (apogee-09ee4a0c)
│   └── screening-queue.spec.ts         # NEW: EXP-003 (apogee-cc833b0e)
└── platform/
    ├── mfa-enforcement.spec.ts  # NEW: PLT-US-002 (apogee-20db56ef)
    └── audit-log-viewer.spec.ts # NEW: Audit search (apogee-798c7a13)
```

---

## Why Acceptance Criteria Need Playwright Tests

### The Rule

**If a feature is for end users (not internal system behavior), it MUST have Playwright tests.**

### Rationale

1. **Unit/Integration Tests Verify API Correctness**
   - Test that GraphQL resolvers return correct data
   - Test that database constraints are enforced
   - Test that business logic computes correctly

2. **Playwright Tests Verify USER EXPERIENCE**
   - Test that forms render correctly and validate input
   - Test that navigation works as expected
   - Test that error messages are user-friendly
   - Test that data displays in readable format
   - Test that workflows complete successfully from a human perspective

3. **Users Interact Through UI, Not GraphQL Directly**
   - A working API ≠ a usable application
   - Frontend bugs (state management, rendering, validation) only surface in browser tests
   - Integration between frontend and backend can fail even if both work independently

### Exceptions (No Playwright Needed)

- Background jobs / scheduled tasks (use unit tests + logs verification)
- Internal system integrations (webhooks, file imports) - use integration tests
- Performance benchmarks (use dedicated perf test suite)
- Database migrations (use migration test framework)

---

## Created Beads Summary

### Parent Epic
- **apogee-73257382**: Acceptance Criteria Test Coverage Gap Analysis - Epic

### Child Epics by Feature
| Bead ID | Feature | Missing Tests | Priority |
|---------|---------|---------------|----------|
| apogee-a9db0b89 | FEAT-001 Financial Management | ~38 | 2 |
| apogee-abe7afc8 | FEAT-002 Procurement & Supply Chain | ~18 | 2 |
| apogee-84f47326 | FEAT-003 Sales & Commercial | ~12 | 2 |
| apogee-22d921b0 | FEAT-004 Customer Relationship | ~8 | 3 |
| apogee-1fce28ab | FEAT-006 Export Control & Sanctions | ~10 | **1** 🔴 |
| apogee-758b72c1 | FEAT-009 Platform Infrastructure | ~15 | 2 |

### Individual Task Beads Created (10 of ~120+)
| Bead ID | Title | Feature | Priority |
|---------|-------|---------|----------|
| apogee-9a5d8fc3 | Chart of Accounts management UI test | FEAT-001 | 2 |
| apogee-6e894489 | Payment application to invoices UI test | FEAT-001 | 2 |
| apogee-9adc910e | PO creation and approval workflow UI test | FEAT-002 | 2 |
| apogee-9682c724 | 3-way match exception handling UI test | FEAT-002 | 2 |
| apogee-b5def64b | Blocked vendor PO prevention UI test | FEAT-002 | **1** 🔴 |
| apogee-af4c2f34 | Quote creation and approval workflow UI test | FEAT-003 | 2 |
| apogee-ec5da06e | Activity logging on contacts UI test | FEAT-004 | 3 |
| apogee-09ee4a0c | Product classification assignment UI test | FEAT-006 | **1** 🔴 |
| apogee-cc833b0e | Denied-party screening queue review UI test | FEAT-006 | **1** 🔴 |
| apogee-20db56ef | MFA enforcement by role UI test | FEAT-009 | 1 |
| apogee-798c7a13 | Audit log viewer and search UI test | FEAT-009 | 2 |

---

## Next Steps

### Immediate (This Sprint)
1. **Prioritize compliance-critical tests** - Complete all FEAT-006 Export Control tests first
2. **Implement test structure standard** - Ensure all new tests follow the prescribed pattern
3. **Add remaining task beads** - Populate child epics with individual user story test tasks

### Short Term (Next 2 Sprints)
1. Complete high-priority financial workflow tests (FEAT-001)
2. Complete procurement approval and compliance tests (FEAT-002)
3. Establish CI pipeline integration for new E2E tests

### Medium Term (Phase 1 Completion)
1. Achieve 80%+ user story coverage with Playwright tests
2. Document test coverage in feature specs (add test references to acceptance criteria)
3. Create performance benchmarks for critical workflows

---

## References

- **Feature Specs:** `docs/helix/01-frame/features/FEAT-*.md`
- **Existing E2E Tests:** `tests/e2e/`
- **Phase 1 Plan:** `docs/helix/02-design/solution-designs/SD-003-phase1-implementation-plan.md`
- **Tracker Beads:** Parent epic apogee-73257382 and children

---

**Analysis Date:** 2026-04-09  
**Analyst:** HELIX automated gap analysis  
**Commit:** b48f7f4 (wp-9: Create beads for acceptance criteria Playwright test coverage gaps)
