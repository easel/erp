# Phase 1 Implementation Plan: SatERP

**Authority Level:** 4 (Design)
**Status:** Draft
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md)

---

## 1. Phase 1 Objective

Replace NetSuite for day-to-day financial and commercial operations with export compliance baked in from day one.

**Exit Criteria:** A reference satellite operator can:

- Run a monthly financial close (GL, AP, AR, intercompany, consolidation, reporting)
- Process hardware sales orders from quote through delivery
- Every sales order, PO, and shipment passes automated export compliance screening
- CRM pipeline tracks opportunities through to closed-won quotes

---

## 2. Work Packages

Phase 1 is organized into eight sequential work packages (WP-0 through WP-7). Each WP produces a deployable, independently testable increment. Dependencies are enforced at the WP level; within a WP, sub-tasks may overlap at the implementer's discretion.

### WP-0: Project Bootstrap (Foundation)

**Duration estimate:** 2 weeks
**Dependencies:** None

| Deliverable | Detail |
|---|---|
| Monorepo scaffold | pnpm workspaces, turborepo pipeline, shared `tsconfig` with strict mode |
| Local dev environment | `docker-compose` for PostgreSQL 16, Redis 7, Mailpit |
| CI pipeline | GitHub Actions: lint, typecheck, unit test, build, container image push |
| Database migration framework | graphile-migrate (SQL-first migrations, no ORM lock-in) |
| Shared kernel package | `@saterp/kernel` -- base types, Result/Error types, audit context, pagination primitives |
| API framework | Fastify + GraphQL Yoga + Pothos (GraphQL) + OpenAPI auto-gen for REST endpoints |
| Authentication scaffolding | OIDC client integration (Keycloak dev instance), session store in Redis |
| Deployment manifests | Dockerfile (multi-stage), Helm chart with values for dev/staging/prod |
| Observability baseline | Structured JSON logging, OpenTelemetry traces, `/health/live` + `/health/ready` endpoints |

**Definition of Done:** A contributor can clone the repo, run `pnpm install && docker compose up`, and hit the GraphQL playground with a valid JWT from the dev Keycloak instance.

---

### WP-1: Platform Core

**Duration estimate:** 3--4 weeks
**Dependencies:** WP-0

Covers PRD requirements PLT-001 through PLT-006.

| Req | Deliverable | Detail |
|---|---|---|
| PLT-001 | API layer | REST + GraphQL, input validation (zod), structured errors, cursor pagination, rate limiting |
| PLT-002 | RBAC engine | Role/permission model, entity-level access control, ITAR compartment labels on roles and data, permission check middleware |
| PLT-003 | Audit log | Immutable append-only table (`audit_events`), captures every CUD operation with actor, entity, timestamp, before/after payload; no DELETE on this table |
| PLT-004 | Multi-entity data model | `legal_entities` table, entity-context middleware (header or JWT claim), row-level entity filtering, cross-entity query prevention by default |
| PLT-005 | Database infrastructure | Schema management conventions, connection pooling (pgBouncer sidecar), migration CI gate, seeded dev data |
| PLT-006 | AuthN | OIDC SSO (Keycloak, Okta, Azure AD) + SAML 2.0 SSO, TOTP MFA, session management, token refresh, forced logout |

**Additional deliverables:**

- Seed data script: 3 test legal entities (US parent, UK subsidiary, SG subsidiary), 5 users across roles (admin, finance, sales, compliance, read-only)
- Permission matrix documentation (role x resource x action)
- ITAR compartment smoke test: a user without ITAR clearance cannot access ITAR-labeled records

**Acceptance Criteria:**

- All API endpoints enforce authentication and RBAC
- Audit log captures actor, action, entity, and payload diff for every mutation
- Multi-entity isolation verified: entity-A user cannot read entity-B data
- ITAR compartment labels restrict access to classified records
- SSO login flow works end-to-end with at least one OIDC provider and one SAML 2.0 provider

**Key Risks:**

- RBAC + ITAR compartment model complexity -- mitigate with a clear permission DSL and thorough test matrix
- Multi-tenant data isolation bugs -- mitigate with mandatory entity-context middleware and integration tests that cross entity boundaries

**Definition of Done:** Platform SDK package (`@saterp/platform`) is published, integration tests pass for all PLT requirements, and a second WP (WP-2 or WP-3) can build on it without touching platform internals.

---

### WP-2: Financial Management Core

**Duration estimate:** 5--6 weeks
**Dependencies:** WP-1

Covers PRD requirements FIN-001 through FIN-007. Broken into three sub-packages to allow incremental delivery.

#### WP-2a: Chart of Accounts & General Ledger (weeks 1--2)

| Req | Deliverable | Detail |
|---|---|---|
| FIN-001 | Multi-entity COA | Hierarchical account structure, account types (asset/liability/equity/revenue/expense), per-entity overrides, GAAP/IFRS tagging |
| FIN-002 | General Ledger | Double-entry journal engine, posting validation (debits = credits), period-aware posting, reversals, recurring journals |

#### WP-2b: AP, AR & Multi-Currency (weeks 2--4)

| Req | Deliverable | Detail |
|---|---|---|
| FIN-003 | Accounts Payable | Vendor invoices, approval workflow, payment batches, aging reports |
| FIN-004 | Accounts Receivable | Customer invoices, payment application, credit memos, aging reports |
| FIN-005 | Multi-currency | Currency master, daily exchange rates (manual + API feed), transaction-currency vs. functional-currency, realized/unrealized gain/loss |

#### WP-2c: Intercompany & Reporting (weeks 4--6)

| Req | Deliverable | Detail |
|---|---|---|
| FIN-006 | Intercompany | IC transaction pairs, auto-matching, elimination entries, IC reconciliation report |
| FIN-007 | Financial reporting | Trial balance, income statement, balance sheet, cash flow (indirect), consolidation across entities with currency translation |

**Acceptance Criteria:**

- Journal entries enforce double-entry invariant (DB constraint + application check)
- Multi-currency transactions post at correct rate with gain/loss on settlement
- Period close locks all further posting to closed periods
- Intercompany elimination entries auto-generate and balance
- Consolidated trial balance across 3 test entities balances to zero
- Financial statements render correctly for a single entity and consolidated

**Key Risks:**

- Currency translation rounding errors -- mitigate with decimal(19,6) precision and explicit rounding rules
- Intercompany elimination edge cases -- mitigate with a reconciliation report that flags imbalances before close

**Definition of Done:** A test accountant can post journals, process AP/AR, run month-end close with intercompany eliminations, and generate consolidated financial statements -- all within the test harness.

---

### WP-3: Export Control Engine

**Duration estimate:** 3--4 weeks
**Dependencies:** WP-1
**Parallel with:** WP-2 (no dependency between Finance and Export Control)

Covers PRD requirements EXP-001 through EXP-004, EXP-006, and EXP-012.

| Req | Deliverable | Detail |
|---|---|---|
| EXP-001 | Classification engine | ECCN/USML classification database, item classification assignment (explicit per-item only — see ADR-001) |
| EXP-002 | Denied-party screening | Consolidated screening list integration (BIS, OFAC SDN, EU sanctions, UN), fuzzy name matching (Levenshtein + alias expansion), batch + real-time screening, match scoring and threshold config |
| EXP-003 | Transaction holds | Automatic hold on screening hits, compliance officer review queue, release/reject workflow, hold reason and resolution audit trail |
| EXP-004 | Country restrictions | Country-level deny/allow lists per classification, embargo enforcement, end-use/end-user checks |
| EXP-006 | Five-level restriction model | Country restriction rules aligned to five-level model (EMBARGOED, HEAVILY_RESTRICTED, LICENSE_REQUIRED, CAUTION, UNRESTRICTED) per FEAT-006 |
| EXP-012 | Sub-national region restrictions | Restricted region definitions with GeoJSON boundaries and administrative division matching for sub-national sanctions enforcement |

**Additional deliverables:**

- Screening list ingestion pipeline (download, parse, normalize, load -- scheduled daily)
- Screening result cache (avoid re-screening unchanged counterparties within TTL)
- Compliance dashboard: holds pending review, screening hit rate, list freshness
- `@saterp/compliance` SDK: `screenTransaction(tx)` callable from Sales, Procurement, and Logistics modules

**Acceptance Criteria:**

- Denied-party screening returns results within 500ms for single-party real-time checks
- Fuzzy matching catches common evasion patterns (transliteration, name reordering, abbreviation)
- A transaction involving a denied party is automatically placed on hold
- A compliance officer can review, release (with justification), or reject held transactions
- Country restrictions block shipment of ITAR-controlled items to embargoed destinations
- Full audit trail for every screening event and hold/release decision

**Key Risks:**

- False positive rate on fuzzy matching -- mitigate with tunable scoring thresholds and a "known good" whitelist
- Screening list update latency -- mitigate with daily automated ingestion and a freshness indicator on the dashboard
- Performance under batch screening (bulk order import) -- mitigate with async queue processing and result caching

**Open Design Questions:**

- **ADR-001: Classification inheritance policy — pending counsel review.** Whether assemblies automatically inherit the highest child classification is an open design question requiring ITAR counsel review. Phase 1 does not implement automatic inheritance; every item must be explicitly classified. This ADR will be resolved before Phase 2 introduces BOM-aware compliance features.

**Definition of Done:** The compliance SDK can be called from any module, screening lists are auto-ingested, and the hold/release workflow is exercised in integration tests with known denied-party test data.

---

### WP-4: Procurement

**Duration estimate:** 3--4 weeks
**Dependencies:** WP-1 (Platform), WP-2a/2b (AP integration), WP-3 (compliance screening on POs)

Covers PRD requirements SCM-001 through SCM-004.

| Req | Deliverable | Detail |
|---|---|---|
| SCM-001 | Purchase orders | PO creation, approval workflow, multi-line items, status tracking (draft/approved/sent/partially received/closed) |
| SCM-002 | Vendor master | Vendor records, classification, banking info, compliance status (screening result), performance tracking |
| SCM-003 | Inventory | SKU master, warehouse locations, on-hand quantities, committed/available, lot/serial tracking for controlled items |
| SCM-004 | Goods receipt | Receipt against PO, quantity/quality inspection, inventory update, three-way match (PO/receipt/invoice), barcode/scan support for receiving (scan PO barcode, scan item barcodes for receipt line entry) |

**Integration points:**

- **Finance (WP-2):** Goods receipt triggers AP accrual; three-way match enables invoice approval
- **Export Control (WP-3):** Vendor screening on PO approval; item classification check on PO lines

**Acceptance Criteria:**

- PO approval triggers vendor denied-party screening; PO held if vendor is flagged
- Goods receipt updates on-hand inventory and posts AP accrual journal entry
- Three-way match (PO line qty/price vs. receipt qty vs. vendor invoice) flags discrepancies
- Vendor master stores and displays current screening status
- Goods receipt supports barcode scanning: scan PO barcode to load receipt, scan item barcodes to populate receipt lines

**Key Risks:**

- Three-way match tolerance rules need careful tuning per entity -- mitigate with configurable tolerance thresholds
- Inventory concurrency (simultaneous receipts/issues) -- mitigate with row-level locking on stock records

**Definition of Done:** A procurement user can create a PO, receive goods, match to vendor invoice, and see the resulting AP entry and inventory update -- with compliance screening at each gate.

---

### WP-5: Sales & CRM

**Duration estimate:** 4--5 weeks
**Dependencies:** WP-1 (Platform), WP-2a/2b (AR/invoicing), WP-3 (compliance screening on orders)

Covers PRD requirements SLS-001 through SLS-004 and CRM-001 through CRM-003.

#### WP-5a: CRM Foundation (weeks 1--2)

| Req | Deliverable | Detail |
|---|---|---|
| CRM-001 | Contacts & companies | Company records, contact records, relationships, address management, compliance screening status |
| CRM-002 | Pipeline management | Opportunity stages (configurable), weighted forecasting, stage-gate rules |
| CRM-003 | Activities | Activity log (calls, meetings, emails, notes), task assignments, timeline view |

#### WP-5b: Sales Order Processing (weeks 2--5)

| Req | Deliverable | Detail |
|---|---|---|
| SLS-001 | Quotes | Quote creation from opportunity, line items from product catalog, pricing, validity period, quote-to-order conversion |
| SLS-002 | Sales orders | Order from quote (or direct entry), compliance screening trigger, approval workflow, status tracking (draft/confirmed/in-fulfillment/shipped/invoiced) |
| SLS-003 | Customer master | Customer records (extends CRM company), billing/shipping addresses, payment terms, credit limits, tax identifiers |
| SLS-004 | Product catalog | Product records, ECCN classification link, pricing tiers, unit of measure, BOM (bill of materials) for assemblies |
| SLS-005 | RMA / return processing | Return merchandise authorization workflow, credit memo generation, inventory return receipt, compliance re-screening on inbound returns |

**Integration points:**

- **Finance (WP-2):** Shipment confirmation triggers AR invoice generation (shipment-triggered invoicing, not order-confirmation-triggered)
- **Export Control (WP-3):** Customer screening on order confirmation; item classification + country check on order lines
- **CRM (WP-5a):** Opportunity closed-won converts to quote; quote converts to order

**Acceptance Criteria:**

- Full pipeline flow: opportunity -> quote -> order -> compliance check -> fulfillment
- Customer denied-party screening on order confirmation; order held if customer flagged
- Country restriction check on order lines containing controlled items
- Shipment confirmation generates AR invoice with correct currency and payment terms
- Pipeline forecast report shows weighted revenue by stage

**Key Risks:**

- Quote-to-order conversion edge cases (partial acceptance, line-level changes) -- mitigate with explicit conversion rules and audit trail
- CRM data quality (duplicate companies) -- mitigate with fuzzy duplicate detection on create

**Definition of Done:** A sales user can manage the full pipeline, generate quotes, convert to orders, and the compliance + invoicing integrations fire correctly.

---

### WP-6: Logistics

**Duration estimate:** 2--3 weeks
**Dependencies:** WP-5 (sales orders to fulfill), WP-3 (shipment compliance checks), WP-4 (inventory)

Covers PRD requirements LOG-001 through LOG-002.

| Req | Deliverable | Detail |
|---|---|---|
| LOG-001 | Pick/pack/ship | Fulfillment queue (from confirmed sales orders), pick list generation, pack confirmation, shipment creation, carrier tracking integration stub |
| LOG-002 | Customs documentation | Commercial invoice generation, packing list, shipper's letter of instruction (SLI), Electronic Export Information (EEI) data, destination control statement (DCS) for ITAR items |

**Integration points:**

- **Sales (WP-5):** Confirmed orders feed the fulfillment queue; shipment confirmation updates order status
- **Export Control (WP-3):** Pre-shipment compliance check (denied party + country + classification); DCS auto-populated from item classification
- **Inventory (WP-4/SCM-003):** Pick depletes on-hand; pack confirms serial/lot for controlled items
- **Finance (WP-2):** Shipment triggers revenue recognition event and invoice delivery

**Acceptance Criteria:**

- Fulfillment queue shows all confirmed, unshipped order lines
- Pick operation validates stock availability and decrements committed inventory
- Pre-shipment compliance check runs automatically; shipment blocked if check fails
- Customs documents auto-generated with correct classification data and DCS where required
- Shipment confirmation updates sales order status and triggers invoice

**Key Risks:**

- Partial shipments complicate order status and invoicing -- mitigate with line-level fulfillment tracking
- Customs document regulations vary by destination -- mitigate with template-based document generation and country-specific rules

**Definition of Done:** A warehouse user can pick, pack, and ship against a sales order, generating all required customs documentation, with compliance checks at the shipment gate.

---

### WP-7: Integration & End-to-End Testing

**Duration estimate:** 3--4 weeks
**Dependencies:** WP-2 through WP-6

| Test Category | Scope |
|---|---|
| E2E workflow: order-to-cash | Quote -> order -> compliance check -> pick/pack/ship -> customs docs -> invoice -> payment application |
| E2E workflow: procure-to-pay | PO -> vendor compliance check -> goods receipt -> three-way match -> AP invoice -> payment |
| Financial close | Period close, intercompany eliminations, consolidation, statement generation across 3 test entities |
| Compliance scenarios | Denied-party hit (hold/release/reject), country embargo block, ITAR item to restricted destination, false-positive release |
| Performance testing | Target volumes: 50 legal entities, 10K+ open transactions, 100K vendor/customer records, 1M SKUs |
| Security audit | NIST 800-171 control checklist, penetration testing on API surface, RBAC bypass attempts, ITAR compartment leak tests |
| Data migration dry run | Trial migration of COA, vendor/customer master, and open transactions from NetSuite export |

**Acceptance Criteria:**

- All E2E workflows pass without manual intervention (except compliance officer hold review)
- Financial close produces balanced statements matching a manually verified baseline
- All NIST 800-171 applicable controls documented with evidence
- Performance targets met: 95th percentile API response under 500ms at target volume

**Definition of Done:** Phase 1 exit criteria met -- the reference operator scenario runs end-to-end, financial close is verified, and compliance screening is proven.

---

## 3. Dependency Graph

```
WP-0  Project Bootstrap
 |
 v
WP-1  Platform Core
 |
 +-----------+-----------+
 |                       |
 v                       v
WP-2  Finance         WP-3  Export Control
 |  (5-6 wk)            |  (3-4 wk)
 |                       |
 +-----+-----+----------+
       |     |           |
       v     v           |
      WP-4  Procurement  |
       |   (3-4 wk)      |
       |                  |
       +-------+----------+
               |
               v
            WP-5  Sales & CRM
               |   (4-5 wk)
               |
               v
            WP-6  Logistics
               |   (2-3 wk)
               |
               v
            WP-7  Integration & E2E Testing
                   (3-4 wk)
```

**Legend:**

- Arrows indicate "must complete before"
- WP-2 and WP-3 run in parallel (both depend only on WP-1)
- WP-4 and WP-5 both require WP-2 and WP-3; they could overlap if teams are available, but WP-5 also depends on WP-4 for inventory integration in Logistics
- WP-6 is strictly after WP-5 (needs sales orders) and WP-4 (needs inventory)
- WP-7 begins as modules complete but full execution requires all prior WPs

---

## 4. Work Package Details Summary

| WP | PRD Reqs | Key Deliverables | Estimated Duration |
|---|---|---|---|
| WP-0 | -- | Repo, CI, dev env, Helm chart | 2 wk |
| WP-1 | PLT-001..006 | API layer, RBAC, audit, multi-entity, auth | 3--4 wk |
| WP-2 | FIN-001..007 | COA, GL, AP, AR, multi-currency, IC, reporting | 5--6 wk |
| WP-3 | EXP-001..004, 006, 012 | Classification, screening, holds, country rules, five-level restriction model, sub-national regions | 3--4 wk |
| WP-4 | SCM-001..004 | POs, vendor master, inventory, goods receipt | 3--4 wk |
| WP-5 | SLS-001..004, CRM-001..003 | Quotes, orders, customer master, catalog, pipeline | 4--5 wk |
| WP-6 | LOG-001..002 | Pick/pack/ship, customs docs | 2--3 wk |
| WP-7 | -- | E2E tests, perf tests, security audit, migration dry run | 3--4 wk |

---

## 5. Critical Path

The longest sequential dependency chain determines the minimum calendar time:

```
WP-0 (2 wk)
  -> WP-1 (4 wk)
    -> WP-2 (6 wk)          [WP-3 runs in parallel but finishes sooner]
      -> WP-5 (5 wk)        [WP-4 can overlap with early WP-5 work]
        -> WP-6 (3 wk)
          -> WP-7 (4 wk)
```

**Critical path total: ~24 weeks (6 months)**

The critical path runs through Finance (WP-2), not Export Control (WP-3), because Finance is the longer work package. Any delay in WP-2 directly delays the overall timeline.

**Critical path mitigation strategies:**

- Staff WP-2 with the most experienced financial domain contributors
- Begin WP-2c (intercompany/reporting) design during WP-2b implementation
- Start WP-5a (CRM) as soon as WP-1 completes since CRM has no Finance dependency; only WP-5b (sales orders) needs WP-2

---

## 6. Parallel Tracks

With sufficient contributors, Phase 1 can run on three parallel tracks after WP-1 completes:

| Track | WPs | Focus | Team Profile |
|---|---|---|---|
| **Track A: Finance** | WP-2, then WP-4 | GL, AP/AR, multi-currency, procurement | Accounting domain + backend |
| **Track B: Compliance** | WP-3 | Export control engine, screening lists, hold workflow | Security/compliance domain + backend |
| **Track C: Commercial** | WP-5a (CRM early start), then WP-5b, then WP-6 | CRM, sales, logistics | Product/sales domain + backend + frontend |

**Synchronization points:**

- After WP-2b + WP-3 complete: WP-4 and WP-5b can begin (both need Finance AP/AR and Compliance SDK)
- After WP-4 + WP-5 complete: WP-6 begins (needs inventory and sales orders)
- WP-7 begins incrementally as modules deliver, with full E2E execution after WP-6

```
Week:   1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 21 22 23 24
        [WP-0 ] [WP-1          ]
Track A:                         [WP-2                          ] [WP-4         ]
Track B:                         [WP-3            ]
Track C:                         [WP-5a     ] [-----WP-5b--------------] [WP-6  ]
Testing:                                                                  [WP-7  ----]
```

*Note: WP-5b start overlaps with WP-2b/WP-3 completion. WP-5a (CRM) can start with only WP-1.*

---

## 7. Testing Strategy

### Unit Tests

- **Coverage target:** 90%+ for domain logic packages (GL engine, compliance screening, currency conversion)
- **Framework:** Vitest
- **Focus areas:** Double-entry invariants, currency rounding, fuzzy name matching algorithms, RBAC permission evaluation, period close rules

### Integration Tests

- **Scope:** API endpoint testing with a real PostgreSQL instance (testcontainers)
- **Focus areas:** Cross-module workflows (e.g., goods receipt -> AP accrual), multi-entity isolation, audit log completeness
- **Data fixtures:** Seed scripts per module with known-good test data

### End-to-End Tests

- **Framework:** Playwright (if UI is included in Phase 1) or API-driven E2E via supertest
- **Key workflows:**
  - Quote -> order -> compliance check -> fulfill -> ship -> invoice -> payment
  - PO -> goods receipt -> three-way match -> payment
  - Month-end close -> intercompany elimination -> consolidated statements
- **Environment:** Dedicated E2E environment with pre-seeded data

### Compliance Test Suite

- **Dedicated test suite** for export control scenarios, run on every CI build
- **Scenarios:**
  - Known denied-party name -> auto-hold
  - Near-miss fuzzy match -> hold with score
  - Cleared party -> no hold
  - ITAR item to embargoed country -> block
  - ITAR item to allied country -> pass
  - Hold release with justification -> audit trail recorded
  - Screening list update -> previously clear party now flagged

### Performance Tests

- **Tool:** k6 or Artillery
- **Target volumes:**
  - 50 legal entities
  - 100K vendor/customer records
  - 1M SKU catalog
  - 10K concurrent open transactions
  - 500 concurrent API users
- **SLAs:** 95th percentile API response < 500ms, batch screening (1000 parties) < 30s, financial report generation < 10s

---

## 8. Migration & Go-Live Considerations

### Data Migration (from NetSuite)

| Data Set | Priority | Approach |
|---|---|---|
| Chart of accounts | Must-have | CSV export, transform to SatERP COA schema, validate mappings |
| Vendor master | Must-have | Export with banking, compliance status; re-screen all vendors on import |
| Customer master | Must-have | Export with billing/shipping addresses; re-screen all customers on import |
| Open AP invoices | Must-have | Migrate as opening balances; link to migrated vendor records |
| Open AR invoices | Must-have | Migrate as opening balances; link to migrated customer records |
| Open POs/SOs | Case-by-case | Only migrate orders not yet fulfilled; complete in-flight orders in NetSuite |
| Historical GL | Nice-to-have | Migrate summary balances as opening journal entry; archive detail in NetSuite |
| Product catalog | Must-have | Export SKUs with ECCN classification; validate against SatERP classification engine |

### Parallel Run Period

- **Duration:** 2 accounting periods (months) minimum
- **Approach:** Dual-entry in both NetSuite and SatERP; reconcile at period close
- **Go/no-go criteria:** SatERP financial statements match NetSuite within tolerance (< 0.01% variance attributable to rounding)

### Rollback Plan

- NetSuite subscription maintained for 3 months post-cutover
- Daily data sync from SatERP to NetSuite during parallel run (one-way, for rollback readiness)
- Documented rollback procedure: re-point users to NetSuite, replay any SatERP-only transactions

### Training Needs

| Audience | Training Focus | Format |
|---|---|---|
| Finance team | GL, AP/AR, period close, reporting | Hands-on workshop (2 days) |
| Procurement | PO workflow, goods receipt, three-way match | Hands-on workshop (1 day) |
| Sales | CRM, quote-to-order, pipeline | Hands-on workshop (1 day) |
| Compliance officers | Screening dashboard, hold/release workflow, list management | Hands-on workshop (1 day) |
| Warehouse | Pick/pack/ship, customs docs | Hands-on workshop (0.5 day) |
| IT/Admin | RBAC config, entity setup, OIDC config, monitoring | Technical workshop (1 day) |

---

## 9. Phase 1 to Phase 2 Handoff

Phase 1 must establish foundations that Phase 2 builds on. The following design decisions in Phase 1 are load-bearing for Phase 2 and must not be shortcut:

### Data Model Extensibility

- **Orbital asset model:** Phase 1 product catalog must support a `product_type` discriminator so Phase 2 can introduce `satellite`, `ground_station`, and `spectrum_license` as first-class product types without schema migration on the core table.
- **Contract model:** Phase 1 sales orders are simple goods sales. The order schema must accommodate future extension to recurring service contracts (transponder leases, capacity agreements) with billing schedules.
- **Metadata extensibility:** Each core entity should support a typed `custom_fields` JSONB column for operator-specific extensions, validated against a configurable schema.

### Compliance Engine Extensibility

- **License management:** Phase 1 builds screening and holds. Phase 2 adds license tracking (DSP-5, DSP-73, TAA). The compliance SDK interface must be designed to accept a `complianceContext` that can carry license references in Phase 2.
- **Technology control plans:** Phase 1 ITAR compartments are access-control only. Phase 2 adds TCP management. The RBAC compartment model must be extensible to TCP-specific access rules.

### Integration Architecture

- **Event backbone:** Phase 1 cross-module integrations (e.g., shipment -> invoice) should use an internal event bus (even if initially in-process). Phase 2 will externalize this to a message broker for third-party integrations (TT&C systems, spectrum databases).
- **API versioning:** Phase 1 APIs must be versioned (`/v1/`) from the start. Phase 2 may introduce breaking changes that require `/v2/` endpoints while maintaining `/v1/` for existing integrations.

### Operational Readiness

- **Multi-region deployment:** Phase 1 Helm charts should parameterize region-specific configuration (data residency, ITAR data isolation) even if Phase 1 deploys to a single region.
- **Tenant isolation:** Phase 1 multi-entity is single-database with row-level isolation. The schema must support future migration to schema-per-entity or database-per-entity if a customer requires stronger isolation.
