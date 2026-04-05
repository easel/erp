# FEAT-008: Program Management

**Authority Level:** 3 (Governing)
**Status:** Draft
**Created:** 2026-04-04
**Governed by:** [PRD](../prd.md)

---

## Overview

Satellite build programs span years, cost hundreds of millions, and involve complex milestone-based billing and earned value tracking. A single operator may have 3-10 concurrent programs (GEO communication satellites, LEO constellation batches, ground station upgrades) sharing engineering staff, cleanroom facilities, and vendor relationships. Delays in one program cascade across the portfolio through shared resources and common vendor dependencies.

This module tracks programs from concept through deorbit, providing work breakdown structures, milestone tracking with critical path analysis, milestone-triggered billing integration, earned value management, cross-program resource planning, and financial dashboards with cost-at-completion forecasting.

## User Stories

### Program & WBS

- **PGM-US-001:** As a program manager, I want to create a program with a hierarchical work breakdown structure so that I can decompose a satellite build into manageable work packages with clear ownership.
- **PGM-US-002:** As a program manager, I want to define WBS elements with planned start/end dates, budget, and responsible team so that every work package has clear schedule and cost targets.
- **PGM-US-003:** As a program manager, I want to assign team members to a program with defined roles (PM, systems engineer, lead integration engineer, etc.) so that responsibility is unambiguous.
- **PGM-US-004:** As a program director, I want to view all active programs in a portfolio view so that I can assess overall organizational workload and identify conflicts.

### Milestone Tracking

- **PGM-US-010:** As a program manager, I want to define milestones (PDR, CDR, integration, test, ship, launch, IOT, acceptance) with planned dates and dependencies so that I can track progress against the program schedule.
- **PGM-US-011:** As a program manager, I want to record actual milestone completion dates and compare them against planned dates so that I can identify schedule slippage early.
- **PGM-US-012:** As a program manager, I want the system to compute the critical path across milestones with dependencies so that I know which milestones have zero float.
- **PGM-US-013:** As a program manager, I want to receive alerts when a milestone is at risk (approaching planned date without prerequisite completion) so that I can intervene before schedule slip.

### Milestone Billing

- **PGM-US-020:** As a finance controller, I want to link billing schedules to program milestones so that customer invoices are triggered by verified milestone completion rather than calendar dates.
- **PGM-US-021:** As a finance controller, I want milestone completion to require formal signoff (PM + customer representative) before billing is triggered so that we only invoice for accepted work.
- **PGM-US-022:** As a contracts manager, I want to define billing amounts per milestone (absolute or percentage of contract value) so that the billing schedule matches the contract terms.
- **PGM-US-023:** As an AR analyst, I want milestone billing events to automatically create draft invoices in Accounts Receivable so that billing is timely and traceable to program delivery.

### Earned Value Management

- **PGM-US-030:** As a program manager, I want the system to compute BCWS (Budgeted Cost of Work Scheduled), BCWP (Budgeted Cost of Work Performed), and ACWP (Actual Cost of Work Performed) per WBS element so that I can measure program health objectively.
- **PGM-US-031:** As a program manager, I want to see CPI (Cost Performance Index) and SPI (Schedule Performance Index) at the WBS element, WBS summary, and program level so that I can identify cost and schedule problems at the right granularity.
- **PGM-US-032:** As a program director, I want EAC (Estimate at Completion) computed using multiple methods (CPI-based, SPI-based, composite) so that I have a range of forecast outcomes.
- **PGM-US-033:** As a finance controller, I want EVM data to flow into the program financial dashboard so that cost-at-completion forecasts are grounded in earned value, not just budget burn rate.

### Resource Planning

- **PGM-US-040:** As a resource manager, I want to allocate engineering headcount (by skill/discipline) to programs by time period so that I can plan staffing across concurrent programs.
- **PGM-US-041:** As a resource manager, I want to see a cross-program resource demand heatmap so that I can identify over-allocation and resolve conflicts before they cause delays.
- **PGM-US-042:** As a program manager, I want to flag resource shortfalls against my program plan so that I can escalate staffing requests with data.

### Financial Dashboard

- **PGM-US-050:** As a program director, I want a real-time financial dashboard showing budget, actuals, committed costs, EAC, and margin per program so that I can make portfolio decisions based on current financial status.
- **PGM-US-051:** As a finance controller, I want budget burn-down charts with trend lines so that I can forecast when a program will exhaust its budget.
- **PGM-US-052:** As a CFO, I want a portfolio-level summary showing all programs' financial health (green/yellow/red) with drill-down capability so that I can focus attention on at-risk programs.

## Acceptance Criteria

### PGM-001: Program/Project Creation with WBS

- [ ] User can create a program with name, description, customer, start date, target end date, and budget
- [ ] User can build a hierarchical WBS with at least 5 levels of depth
- [ ] Each WBS element has: code, name, description, planned start, planned end, budgeted cost, and responsible person
- [ ] User can assign team members to a program with defined roles
- [ ] Programs appear in a portfolio list view sortable by status, customer, and date
- [ ] WBS supports both manual entry and import from CSV/Excel

### PGM-002: Milestone Tracking

- [ ] User can define milestones with name, planned date, and type (standard set: PDR, CDR, integration, test, ship, launch, IOT, acceptance; plus custom)
- [ ] User can define dependencies between milestones (finish-to-start, start-to-start, finish-to-finish, start-to-finish with optional lag)
- [ ] System computes critical path and displays it visually (Gantt or network diagram)
- [ ] User can record actual completion date for a milestone, updating status to complete
- [ ] Dashboard shows planned vs. actual dates with variance for all milestones
- [ ] System generates alerts when a milestone is within configurable threshold of planned date and prerequisites are incomplete

### PGM-003: Milestone Billing Integration

- [ ] User can link a billing schedule to a program, associating each billing line to a specific milestone
- [ ] Billing amounts can be defined as fixed amounts or percentage of contract value
- [ ] Milestone completion triggers a billing event only after required signoffs are recorded
- [ ] Billing events create draft invoices in AR with reference to program, milestone, and contract
- [ ] Finance user can review and post milestone-triggered invoices through standard AR workflow
- [ ] Billing status is visible on the program milestone view (unbilled, draft invoice, posted, paid)

### PGM-004: Earned Value Management

- [ ] System computes BCWS, BCWP, and ACWP per WBS element based on planned schedule, reported progress, and actual cost postings
- [ ] System computes CPI (BCWP/ACWP) and SPI (BCWP/BCWS) at element, summary, and program level
- [ ] System computes EAC using at least three methods: CPI-based, SPI-based, and composite (CPI x SPI)
- [ ] EVM metrics roll up correctly through the WBS hierarchy
- [ ] EVM data is available as time-series for trend analysis
- [ ] EVM report exportable to CSV and PDF

### PGM-005: Resource Planning

- [ ] User can define resource types/disciplines (e.g., systems engineer, thermal engineer, integration technician)
- [ ] User can allocate resources to WBS elements by type, headcount, and time period (weekly or monthly)
- [ ] Cross-program resource demand view shows total demand vs. available capacity by discipline and time period
- [ ] Over-allocation is highlighted visually (demand exceeds capacity)
- [ ] User can flag resource shortfalls with priority and escalation notes

### PGM-006: Program Financial Dashboard

- [ ] Dashboard shows per-program: total budget, actuals to date, committed (POs issued), EAC, and margin (budget minus EAC)
- [ ] Budget burn-down chart shows cumulative actuals vs. planned spend curve
- [ ] Portfolio summary shows all programs with color-coded health indicators based on configurable thresholds (e.g., CPI < 0.9 = red)
- [ ] Drill-down from portfolio to program to WBS element
- [ ] Dashboard data refreshes within 5 minutes of underlying transaction changes
- [ ] All dashboard views exportable to PDF

## Domain Model

### Core Entities

- **Program** - Top-level entity representing a satellite build or major project. Fields: id, name, description, customer (ref: Customer), status (concept, active, on-hold, complete, cancelled), planned start, planned end, actual start, actual end, total budget, currency.
- **WorkBreakdownStructure** - The WBS tree associated with a program. A program has exactly one WBS root.
- **WBSElement** - A node in the WBS tree. Fields: id, program (ref), parent element (ref, nullable for root), code (e.g., "1.3.2"), name, description, planned start, planned end, actual start, actual end, budgeted cost, responsible person (ref: User), status.
- **Milestone** - A named checkpoint in a program. Fields: id, program (ref), WBS element (ref, optional), name, type (enum: PDR, CDR, integration, test, ship, launch, IOT, acceptance, custom), planned date, actual date, status (planned, in-progress, complete, late, cancelled), signoff requirements.
- **MilestoneDependency** - A dependency between two milestones. Fields: id, predecessor (ref: Milestone), successor (ref: Milestone), type (FS, SS, FF, SF), lag (duration).
- **MilestoneBillingSchedule** - Links a billing line to a milestone. Fields: id, milestone (ref), contract (ref), billing amount, billing type (fixed, percentage), invoice (ref, nullable), status (pending, triggered, invoiced, paid).
- **EarnedValueMetric** - Periodic EVM snapshot for a WBS element. Fields: id, WBS element (ref), period (date), BCWS, BCWP, ACWP, CPI, SPI, EAC, computed method.
- **ResourceAllocation** - Headcount allocation to a WBS element. Fields: id, WBS element (ref), resource type (ref: ResourceType), headcount, period start, period end.
- **ResourceType** - A discipline or skill category. Fields: id, name, description, available capacity.
- **ProgramTeamMember** - Association of a user to a program with a role. Fields: id, program (ref), user (ref: User), role (PM, systems engineer, etc.), start date, end date.

### Key Relationships

- Program 1:1 WBS root, 1:N WBSElement (through hierarchy), 1:N Milestone, 1:N ProgramTeamMember
- WBSElement 1:N child WBSElement, 1:N EarnedValueMetric, 1:N ResourceAllocation
- Milestone 1:N MilestoneDependency (as predecessor or successor), 0:1 MilestoneBillingSchedule
- MilestoneBillingSchedule N:1 Contract (from Sales module)
- Program N:1 Customer (from CRM/Sales module)

## Key Workflows

### Satellite Build Program Lifecycle

1. Program director creates a program in "concept" status with preliminary budget and schedule
2. Program manager builds out WBS with work packages, assigns team members
3. Program transitions to "active" when funded and staffed
4. Team reports progress against WBS elements; actuals flow from Financial Management
5. EVM metrics computed periodically (weekly or monthly)
6. Milestones reviewed at program reviews; actual dates recorded on completion
7. Program transitions to "complete" after final milestone (acceptance or deorbit)

### Milestone Review and Billing Trigger

1. Program manager records milestone as complete with completion evidence
2. Required signoffs collected (PM, customer representative, quality)
3. System checks all signoff requirements are met
4. Billing event triggered on MilestoneBillingSchedule
5. Draft invoice created in AR with milestone reference
6. Finance reviews and posts invoice through standard AR workflow

### EVM Reporting Cycle

1. At period close, system snapshots BCWS from planned schedule/budget
2. Program manager or team leads report percent complete per WBS element to compute BCWP
3. System pulls ACWP from actual cost postings in Financial Management
4. CPI, SPI, and EAC computed and stored as EarnedValueMetric records
5. Dashboard updated; alerts generated for CPI or SPI below threshold

### Resource Allocation Across Concurrent Programs

1. Resource manager defines available capacity by resource type and period
2. Program managers request allocations against their WBS elements
3. Resource manager reviews cross-program demand heatmap
4. Conflicts resolved through reallocation or escalation
5. Approved allocations visible on program plans and resource views

## Integration Points

| Module | Integration | Direction |
|--------|------------|-----------|
| Financial Management (FIN) | Actual costs flow to ACWP; milestone billing creates AR invoices; budget links to GL accounts | Bidirectional |
| Sales & Commercial (SLS) | Milestone billing schedules reference sales contracts; program milestones drive SLS-007 billing triggers | PGM reads SLS contracts; SLS reads PGM milestone status |
| Orbital Asset Management (OAM) | Completed programs produce orbital assets (satellites); program status links to satellite lifecycle | PGM produces OAM satellite records |
| Procurement (SCM) | POs issued against program budgets feed committed cost; component genealogy links to WBS | SCM costs flow to PGM; PGM budget constrains SCM |
| Platform (PLT) | Workflow engine for milestone signoff approvals; audit log for all program changes; RBAC for program-level access control | PGM uses PLT services |

## Open Design Questions

1. **EVM progress reporting method:** Should percent-complete be reported manually per WBS element, derived from sub-milestone completion, or support both? Manual gives flexibility but adds overhead; milestone-derived is more objective but less granular.
2. **Critical path algorithm:** Should we implement CPM (Critical Path Method) natively or integrate with an external scheduling engine (e.g., MS Project import/export)? Native is simpler to deploy but may lack sophistication for complex programs.
3. **Resource allocation granularity:** Weekly vs. monthly allocation periods? Weekly is more accurate for short-duration programs but creates more data and management overhead.
4. **Multi-program WBS code schemes:** Should WBS codes be globally unique across programs or only unique within a program? Global uniqueness simplifies cross-program reporting but constrains program managers' code schemes.
5. **Milestone signoff workflow:** Should signoff use the generic PLT-007 workflow engine, or does milestone signoff need specialized behavior (e.g., customer external signoff via portal)? Reusing the workflow engine reduces code but may not handle external signers.
