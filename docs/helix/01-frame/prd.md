# Product Requirements Document: SatERP

**Authority Level:** 2 (Governing)
**Status:** Draft
**Created:** 2026-04-04
**Last Updated:** 2026-04-04
**Governs:** All design and implementation artifacts
**Governed by:** [Product Vision](../00-discover/product-vision.md)

---

## 1. Problem

International satellite operators run their businesses on NetSuite, SAP, or stitched-together toolchains that were never designed for the satellite industry. The result:

- **Export compliance is manual and error-prone.** ITAR/EAR classification lives in spreadsheets. Denied-party screening is a separate tool (or a person with a checklist). Delivering hardware to conflict zones like Ukraine and Israel requires ad-hoc workarounds outside the ERP.
- **Orbital assets are invisible to finance.** Satellites, transponders, and spectrum licenses are tracked in custom databases or spreadsheets disconnected from the GL. Revenue recognition for capacity contracts requires manual journal entries.
- **Multi-entity operations are painful.** Consolidation across 10-50 legal entities in different currencies and tax jurisdictions is a month-end fire drill.
- **CRM is a separate system.** Sales pipelines, forecasts, and customer relationships live in Salesforce or HubSpot, disconnected from orders, contracts, and billing.
- **Vendor lock-in is the norm.** NetSuite customizations are expensive and fragile. Operators can't audit, extend, or self-host their own business system.

SatERP replaces this patchwork with a single, open-source, self-hosted ERP that natively understands satellite operations.

## 2. Goals

| ID | Goal | Success Criteria |
|----|------|-----------------|
| G1 | Replace NetSuite for core ERP functions | GL, AP, AR, inventory, order management, and reporting operational for a reference satellite operator |
| G2 | Eliminate manual export compliance workflows | Every sales order, PO, and shipment automatically screened; no hardware leaves without validated classification and licensing |
| G3 | Unify orbital assets with financial operations | Satellites, transponders, and spectrum licenses are GL-linked entities with automated depreciation and revenue allocation |
| G4 | Natively support conflict-zone delivery | Hardware orders to Ukraine, Israel, and similar destinations flow through automated compliance and documentation workflows |
| G5 | Provide full CRM capabilities | Pipeline, forecasting, campaigns, and lead scoring replace Salesforce/HubSpot with data flowing directly into quoting and contracts |
| G6 | Support both GEO and LEO business models | System handles transponder leasing (GEO) and high-volume terminal sales with managed bandwidth (LEO) without mode-switching |
| G7 | Self-hosted, open-source, operator-controlled | Deployable on operator infrastructure or GovCloud; no external data dependencies; full source access |

## 3. Requirements

### 3.1 Financial Management

| ID | Priority | Requirement |
|----|----------|-------------|
| FIN-001 | P0 | Multi-entity chart of accounts with configurable account structures per legal entity |
| FIN-002 | P0 | General ledger with double-entry bookkeeping, journal entries, and period close |
| FIN-003 | P0 | Accounts payable: vendor bills, payment runs (ACH, wire, SWIFT), aging, and 3-way matching |
| FIN-004 | P0 | Accounts receivable: customer invoices, payment application, dunning, and aging |
| FIN-005 | P0 | Multi-currency transactions with configurable exchange rate sources, realized/unrealized gain/loss |
| FIN-006 | P0 | Intercompany transactions with automatic elimination entries on consolidation |
| FIN-007 | P0 | Financial reporting: balance sheet, income statement, cash flow, trial balance, with drill-down to source transactions |
| FIN-008 | P1 | Revenue recognition engine (ASC 606 / IFRS 15): standalone selling price allocation, variable consideration, contract modifications, multi-year amortization schedules |
| FIN-009 | P1 | Fixed asset management: depreciation schedules (straight-line, units-of-production for orbital life), impairment, disposal |
| FIN-010 | P1 | Multi-jurisdictional tax engine: VAT/GST calculation, withholding tax, tax reporting by jurisdiction |
| FIN-011 | P1 | Budgeting and forecasting: budget entry, budget-vs-actual reporting, rolling forecasts |
| FIN-012 | P2 | Hedge accounting support for currency and commodity hedges |
| FIN-013 | P2 | Transfer pricing documentation and intercompany markup rules |
| FIN-014 | P2 | Consolidated financial statements with minority interest and equity method investments |

### 3.2 Procurement & Supply Chain

| ID | Priority | Requirement |
|----|----------|-------------|
| SCM-001 | P0 | Purchase order creation, approval workflows, and receipt matching |
| SCM-002 | P0 | Vendor master with contact, payment terms, currency, and tax configuration |
| SCM-003 | P0 | Inventory management: multi-location, lot/serial tracking, stock levels, reorder points |
| SCM-004 | P0 | Goods receipt and putaway with barcode/scan support |
| SCM-005 | P1 | Blanket purchase orders with release scheduling for long-term component agreements |
| SCM-006 | P1 | Launch vehicle procurement workflow: launch service agreement tracking, manifest slot management, milestone payment schedules, insurance procurement |
| SCM-007 | P1 | Vendor qualification management: approved vendor lists, performance scorecards, ITAR registration status, facility clearance records |
| SCM-008 | P1 | Component genealogy: full traceability from raw material through finished satellite, linking lot/serial to build program and orbital asset |
| SCM-009 | P1 | ITAR/EAR classification per inventory item with automatic propagation to POs and shipments |
| SCM-010 | P2 | Consignment inventory tracking at customer or partner sites |
| SCM-011 | P2 | Bonded warehouse and ITAR-controlled storage facility management |
| SCM-012 | P2 | Demand planning and MRP for terminal/hardware manufacturing |

### 3.3 Sales & Commercial

| ID | Priority | Requirement |
|----|----------|-------------|
| SLS-001 | P0 | Quote creation with line items, pricing, discounts, and approval workflows |
| SLS-002 | P0 | Sales order management: order entry, fulfillment, invoicing, and returns |
| SLS-003 | P0 | Customer master: multi-entity customer records with billing/shipping addresses, payment terms, credit limits |
| SLS-004 | P0 | Hardware product catalog with pricing tiers, availability, and lead times |
| SLS-005 | P1 | Configure-Price-Quote (CPQ): bundled pricing for hardware + installation + bandwidth + managed services with term-based discounting |
| SLS-006 | P1 | Capacity contract management: multi-year transponder leases and managed bandwidth agreements with SLA tracking, usage metering, and escalation clauses |
| SLS-007 | P1 | Milestone billing: billing schedules tied to delivery milestones, program milestones, or calendar dates |
| SLS-008 | P1 | Renewal management: automated renewal notices, contract extension workflows, re-pricing |
| SLS-009 | P2 | Customer self-service portal: hardware ordering, usage dashboards, invoices, support tickets |
| SLS-010 | P2 | Usage-based billing: metered bandwidth consumption with tiered pricing and overage charges |
| SLS-011 | P2 | Partner/reseller management: deal registration, margin tracking, co-sell workflows |

### 3.4 CRM

| ID | Priority | Requirement |
|----|----------|-------------|
| CRM-001 | P0 | Contact and company management with relationship mapping (parent/child accounts, groups) |
| CRM-002 | P0 | Opportunity pipeline with stages, weighted forecasting, and close-date tracking |
| CRM-003 | P0 | Activity tracking: calls, emails, meetings, notes linked to contacts, companies, and opportunities |
| CRM-004 | P1 | Sales forecasting: pipeline rollup by rep, region, product line; forecast vs. quota tracking |
| CRM-005 | P1 | Lead management: lead capture, scoring model, assignment rules, and lead-to-opportunity conversion |
| CRM-006 | P1 | Campaign management: campaign creation, budget tracking, lead attribution, ROI analysis |
| CRM-007 | P1 | Territory management: geographic and account-based territory assignment with quota rollup |
| CRM-008 | P2 | Email integration: bi-directional sync with email providers, template management, sequence automation |
| CRM-009 | P2 | Customer health scoring: usage-based health metrics for capacity customers, churn risk indicators |
| CRM-010 | P2 | Competitive tracking: competitor profiles, win/loss analysis by competitor |

### 3.5 Orbital Asset Management

| ID | Priority | Requirement |
|----|----------|-------------|
| OAM-001 | P1 | Satellite registry: lifecycle status (design, manufacturing, integration, launch, commissioning, operational, end-of-life, deorbited), orbital parameters (TLE), operator, and bus/payload metadata |
| OAM-002 | P1 | Transponder and beam inventory: capacity by satellite, beam, frequency band, and polarization with allocation status (available, committed, sold, spare) |
| OAM-003 | P1 | Capacity allocation tracking: link transponder/beam capacity to customer contracts with utilization reporting |
| OAM-004 | P1 | Ground station asset records: antenna, RF chain, and baseband equipment inventory with maintenance schedules and availability status |
| OAM-005 | P1 | Spectrum license registry: ITU filing status, national licenses by country/band/orbital slot, expiration dates, and renewal tracking |
| OAM-006 | P2 | Satellite depreciation linked to orbital life estimates with impairment triggers (anomalies, fuel depletion) |
| OAM-007 | P2 | Ground station scheduling: antenna time allocation across satellites, pass scheduling for LEO, and conflict resolution |
| OAM-008 | P2 | Spectrum lease management: lease-in/lease-out tracking with financial integration |
| OAM-009 | P2 | Kratos quantumCMD / epoch IPS integration: TT&C telemetry feed for satellite health status, orbit updates, and anomaly alerts |

### 3.6 Export Control & Sanctions Compliance

| ID | Priority | Requirement |
|----|----------|-------------|
| EXP-001 | P0 | Product classification engine: USML category and CCL ECCN assignment per item with jurisdiction determination (ITAR vs. EAR) |
| EXP-002 | P0 | Denied-party screening: automated screening of customers, vendors, end-users, and intermediaries against OFAC SDN, Entity List, Denied Persons List, Unverified List, and allied-nation restricted lists on every transaction |
| EXP-003 | P0 | Transaction hold: automatic hold on any sales order, PO, or shipment that fails screening or lacks required export authorization |
| EXP-004 | P0 | Country and region-based restriction rules: configurable embargo and restriction rules by destination country and sub-national region (e.g., Crimea, Donetsk, Luhansk within Ukraine), triggered on order entry and shipping; addresses that cannot be definitively resolved to a non-restricted region must route to an ambiguous-address manual review workflow |
| EXP-005 | P1 | Export license management: DSP-5, DSP-73, DSP-85, TAA, and BIS license tracking with expiration alerts, quantity/value drawdown against license limits, and proviso compliance |
| EXP-006 | P0 | Screening list auto-update: automated daily ingestion of updated OFAC, BIS, and allied-nation screening lists with manual upload fallback for air-gapped environments |
| EXP-007 | P1 | End-use certificate management: generation, tracking, and archival of end-use/end-user certificates for defense articles |
| EXP-008 | P1 | Audit trail: immutable log of all screening results, classification decisions, license applications, and compliance officer overrides |
| EXP-009 | P2 | Deemed export control: foreign person access tracking, technology control plan management, and deemed export license tracking |
| EXP-010 | P2 | Compliance reporting: ITAR annual compliance reports, BIS semi-annual reports, and voluntary self-disclosure support |
| EXP-011 | P2 | Sanctions scenario modeling: "what-if" analysis for proposed transactions against current sanctions landscape |
| EXP-012 | P0 | Region-aware sanctions handling: the system must maintain sub-national region restriction records for territories subject to region-level sanctions (e.g., Crimea, Donetsk, Luhansk), match shipping addresses against restricted regions using address parsing and geocoding where available, and route ambiguous or unparseable addresses to a compliance officer manual review queue rather than allowing the transaction to proceed |

### 3.7 Complex Delivery & Logistics

| ID | Priority | Requirement |
|----|----------|-------------|
| LOG-001 | P0 | Shipping execution: pick, pack, ship workflow with carrier integration and tracking number capture |
| LOG-002 | P0 | Customs documentation: automated generation of commercial invoices, packing lists, and shipper's export declarations (AES filing) |
| LOG-003 | P1 | Restricted destination workflows: automated escalation, additional documentation requirements, and approval gates triggered by ship-to country classification (sanctioned, conflict zone, restricted end-use) |
| LOG-004 | P1 | Conflict zone delivery management: workflows for deliveries requiring diplomatic clearance, military logistics coordination, NGO partnerships, or special carrier arrangements for destinations like Ukraine and Israel |
| LOG-005 | P1 | Multi-modal freight management: air, ocean, and ground shipping coordination with cost tracking and transit time estimates |
| LOG-006 | P1 | Delivery tracking: end-to-end shipment visibility from warehouse to customer site including customs hold status and in-country forwarding |
| LOG-007 | P2 | Proof of delivery: GPS-tagged, photo-verified delivery confirmation with automatic AR reconciliation |
| LOG-008 | P2 | Carnet and temporary import/export document management |
| LOG-009 | P2 | Remote/austere site delivery planning: logistics workflows for island ground stations, polar sites, maritime platforms, and locations with limited port infrastructure |

### 3.8 Program Management

| ID | Priority | Requirement |
|----|----------|-------------|
| PGM-001 | P1 | Program/project creation with work breakdown structure (WBS), milestone definitions, and team assignments |
| PGM-002 | P1 | Milestone tracking: status, planned vs. actual dates, dependencies, and critical path identification |
| PGM-003 | P1 | Milestone billing integration: link billing schedules to program milestones (PDR, CDR, integration, test, ship, launch, IOT, acceptance) |
| PGM-004 | P2 | Earned value management (EVM): BCWS, BCWP, ACWP, CPI, SPI, and estimate-at-completion |
| PGM-005 | P2 | Resource planning: engineering headcount allocation across concurrent satellite programs |
| PGM-006 | P2 | Program financial dashboard: cost-at-completion forecasting, budget burn-down, and margin tracking |

### 3.9 Platform & Infrastructure

| ID | Priority | Requirement |
|----|----------|-------------|
| PLT-001 | P0 | TypeScript + Node.js backend with REST and GraphQL APIs for all modules |
| PLT-002 | P0 | Role-based access control (RBAC) with entity-level, program-level, and ITAR compartment-level permissions |
| PLT-003 | P0 | Immutable audit log for all create, update, and delete operations across all entities |
| PLT-004 | P0 | Multi-tenant data model supporting 50+ legal entities with per-entity configuration |
| PLT-005 | P0 | Database: PostgreSQL with support for time-series data (telemetry), document storage (contracts, certificates), and relational data (transactions) |
| PLT-006 | P0 | Authentication: SSO (SAML 2.0 / OIDC), MFA, and session management |
| PLT-007 | P1 | Workflow engine: configurable approval workflows for POs, sales orders, shipments, journal entries, and compliance overrides |
| PLT-008 | P1 | Notification system: in-app, email, and webhook notifications for workflow events, compliance alerts, and system events |
| PLT-009 | P1 | Reporting engine: configurable reports with filters, grouping, drill-down, and export (CSV, PDF, Excel) |
| PLT-010 | P1 | Data import/export: bulk import from CSV/Excel for migration; API-based integration for ongoing sync |
| PLT-011 | P1 | Multi-language UI with locale-aware formatting (dates, numbers, currencies) |
| PLT-012 | P2 | Webhook system: outbound webhooks for all entity lifecycle events to support external integrations |
| PLT-013 | P2 | Plugin/extension architecture: documented extension points for operator-specific customizations without forking core |
| PLT-014 | P2 | Configurable per-entity data residency for national data sovereignty requirements |

## 4. Constraints

| ID | Constraint | Rationale |
|----|-----------|-----------|
| C1 | Self-hosted deployment only (no SaaS in Phase 1) | ITAR data sovereignty; operator must control infrastructure |
| C2 | All data at rest and in transit must be encrypted (AES-256, TLS 1.3) | NIST 800-171 alignment for CUI handling |
| C3 | Audit logs must be immutable and retained for minimum 5 years | SOX and ITAR recordkeeping requirements |
| C4 | Export compliance checks cannot be bypassed or disabled | Regulatory requirement; system must enforce, not suggest |
| C5 | System must operate without external network dependencies for core functions | Deployed environments may have restricted internet access |
| C6 | All APIs must support pagination, filtering, and rate limiting | Scalability for large data sets (1M+ SKUs, 10K+ contracts) |
| C7 | Frontend must be usable on standard business hardware (no GPU requirements) | Deployed in offices, not just developer workstations |

## 5. Phasing

### Phase 1: Core ERP + Compliance Foundation

**Goal:** Replace NetSuite for day-to-day financial operations and basic sales/procurement, with export compliance baked in from day one.

**Modules:**
- Financial Management (P0 requirements): GL, AP, AR, multi-currency, intercompany, reporting
- Procurement (P0): POs, vendor management, inventory, receipts
- Sales (P0): Quotes, orders, invoicing, customer master, product catalog
- CRM (P0): Contacts, companies, pipeline, activities
- Export Control (P0): Classification, denied-party screening, transaction holds, country/region restrictions, automated screening list ingestion
- Logistics (P0): Pick/pack/ship, customs docs
- Platform (P0): Auth, RBAC, audit log, APIs, database

**Exit criteria:** A reference satellite operator can run a monthly financial close, process hardware sales orders from quote to delivery, and every transaction passes automated export compliance screening.

### Phase 2: Satellite Domain + Advanced Commercial

**Goal:** Bring orbital assets, spectrum, and advanced commercial capabilities into the ERP.

**Modules:**
- Orbital Asset Management (P1): Satellite registry, transponder inventory, ground stations, spectrum licenses
- Revenue Recognition (P1): ASC 606 engine for capacity contracts
- CPQ and Contract Management (P1): Bundled pricing, multi-year capacity contracts, milestone billing
- Advanced CRM (P1): Forecasting, lead scoring, campaigns, territories
- Launch Procurement (P1): Launch service agreements, manifest management
- Export License Management (P1): License tracking, drawdown, end-use certificates, audit trail
- Program Management (P1): WBS, milestones, milestone billing integration

**Exit criteria:** Orbital assets are tracked in the ERP and linked to customer contracts and financial records. Revenue recognition for capacity contracts is automated. Export licensing is managed in-system.

### Phase 3: Complex Operations + Scale

**Goal:** Handle the hardest operational scenarios and scale to full enterprise deployment.

**Modules:**
- Conflict Zone Delivery (P1): Restricted destination workflows, conflict zone logistics for Ukraine/Israel/similar
- Advanced Logistics (P2): Remote site delivery, carnet management, proof of delivery
- Advanced Finance (P2): Hedge accounting, transfer pricing, consolidated statements
- Kratos Integration (P2): TT&C telemetry feed
- EVM and Resource Planning (P2): Earned value management, resource allocation
- Customer Portal (P2): Self-service ordering, usage dashboards
- Platform Extensions (P2): Plugin architecture, data residency, webhooks

**Exit criteria:** Hardware can be delivered to any destination — including conflict zones and sanctioned territories — through fully automated compliance and logistics workflows. Multi-entity consolidation runs in under 1 hour for 10+ entities.

### Phase 4: Production Cutover

**Goal:** Full replacement of NetSuite and ancillary systems for a reference operator.

- Data migration from NetSuite, Salesforce, and standalone tracking tools
- Parallel run with existing systems
- User training and operational documentation
- Go-live with full production workload

**Exit criteria:** Reference operator is running SatERP as primary system of record with NetSuite decommissioned.

## 6. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R1 | ITAR/EAR compliance gap leads to regulatory violation | Medium | Critical | Engage ITAR counsel for requirements review; build automated compliance test suite with known-good and known-bad transaction scenarios; compliance officer review gate before Phase 1 go-live |
| R2 | ASC 606 implementation produces incorrect revenue schedules | Medium | High | Engage Big 4 advisory for requirement validation; parallel-run with manual calculations; auditor review of engine output before production use |
| R3 | Scope of "full CRM" delays Phase 1 | High | Medium | CRM P0 is deliberately minimal (contacts, pipeline, activities); advanced CRM features are Phase 2. Monitor velocity and descope if needed |
| R4 | Hybrid GEO+LEO model creates conflicting data model assumptions | Medium | Medium | Design domain model to be orbit-agnostic where possible; explicit GEO/LEO configuration at the satellite and contract level, not system level |
| R5 | Sanctions landscape changes between screening list updates | Medium | High | Daily automated list ingestion; manual hold queue for fuzzy matches; compliance officer escalation workflow |
| R6 | Conflict-zone delivery workflows can't be generalized | Medium | Medium | Design workflow engine to be country-configurable; Ukraine and Israel as reference implementations; new destinations add configuration, not code |
| R7 | NetSuite data migration is more complex than estimated | High | Medium | Begin migration mapping in Phase 2; build migration tooling as a first-class module, not an afterthought |
| R8 | Self-hosted deployment burden discourages adoption | Medium | Medium | Provide Docker/Kubernetes deployment manifests, Terraform modules for AWS GovCloud, and comprehensive ops documentation |

## 7. Out of Scope (Phase 1-4)

- **Manufacturing Execution System (MES):** Shop floor control for satellite manufacturing. SatERP tracks programs and milestones, not work orders at the assembly station level.
- **Ground segment network management:** SatERP tracks ground station assets but does not replace network management systems (Kratos handles this via integration).
- **Orbital mechanics / mission planning:** SatERP stores orbital parameters but does not compute maneuvers, conjunction assessments, or launch trajectories.
- **SaaS / multi-tenant hosting:** Self-hosted only. Revisit post-Phase 4 based on market demand.
- **Mobile app:** Web-responsive UI only. Native mobile apps are a future consideration.

---

*This PRD is governed by the [Product Vision](../00-discover/product-vision.md). All feature specs and design documents must trace requirements back to this document.*
