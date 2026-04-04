# Product Vision: SatERP

**Authority Level:** 1 (Governing)
**Status:** Draft
**Created:** 2026-04-04
**Last Updated:** 2026-04-04

---

## Mission

Build an open-source ERP system — functionally equivalent to NetSuite — purpose-built for international satellite operators who design, manufacture, launch, and operate satellite constellations while selling hardware and capacity services to end users across complex geopolitical environments.

## Problem Statement

International satellite operators sit at the intersection of aerospace manufacturing, telecommunications, international trade, and defense-adjacent logistics. No off-the-shelf ERP adequately handles this combination:

- **NetSuite** covers general-purpose ERP but lacks domain awareness for orbital assets, spectrum licensing, ITAR/EAR compliance, and launch vehicle procurement. Customization is expensive, brittle, and vendor-locked.
- **SAP/Oracle** can be bent to fit but require multi-year, multi-million-dollar implementations that still leave gaps in satellite-specific workflows.
- **Vertical aerospace ERPs** focus on manufacturing but ignore the telecom revenue side (capacity contracts, transponder leasing, managed services).

Satellite operators end up with a patchwork of systems — ERP for finance, custom tools for spectrum and orbital mechanics, spreadsheets for export compliance, and manual processes for delivering hardware into sanctioned or conflict-adjacent territories like Ukraine and Israel.

**SatERP eliminates this fragmentation** by providing a single system that understands the full lifecycle: from satellite design and manufacturing, through launch procurement and orbital operations, to hardware sales, capacity contracts, and end-user delivery — all with native support for multinational regulatory compliance, multi-currency consolidation, and complex export controls.

## Market Context

### Target Users

| Role | Primary Needs |
|------|--------------|
| **CFO / Finance** | Multi-entity consolidation, multi-currency, revenue recognition (ASC 606) for long-term capacity contracts, intercompany eliminations |
| **Supply Chain / Procurement** | Launch vehicle procurement, component sourcing with ITAR/EAR tracking, vendor management across jurisdictions |
| **Operations / Ground Stations** | Asset lifecycle management for orbital and ground assets, telemetry integration hooks, ground station scheduling |
| **Sales / Commercial** | Hardware quoting and order management, capacity contract management, CPQ for complex bundles (hardware + bandwidth + managed services) |
| **Regulatory / Compliance** | Spectrum license tracking, ITU filings, export classification (USML/CCL), denied-party screening, sanctions compliance |
| **Logistics / Fulfillment** | Hardware delivery to complex/restricted destinations, freight forwarding coordination, customs documentation, end-use certificates |
| **Program Management** | Satellite build programs, milestone billing, earned value management, multi-year program accounting |

### Key Differentiators vs. NetSuite

1. **Orbital Asset Register** — First-class entities for satellites, transponders, beams, and spectrum assignments with orbital parameters, not bolt-on custom records.
2. **Export Control Engine** — Native ITAR/EAR classification, license management, deemed exports, and denied-party screening integrated into every transaction.
3. **Complex Delivery Logistics** — Purpose-built workflows for hardware delivery into conflict zones, sanctioned territories, and locations requiring end-use certificates, diplomatic clearances, or military end-user documentation.
4. **Spectrum & Regulatory Management** — ITU filing tracking, national licensing across jurisdictions, spectrum lease management, and interference coordination.
5. **Launch Procurement** — Specialized procurement workflows for launch vehicles including milestone payments, insurance, and manifest management.
6. **Capacity Revenue Recognition** — Native ASC 606 / IFRS 15 handling for multi-year transponder leases, managed bandwidth contracts, and hybrid hardware+service bundles.
7. **Open Source** — No vendor lock-in. Operator controls their own data, compliance posture, and customization roadmap.

## Core Domains

### 1. Financial Management

- **General Ledger** — Multi-entity, multi-currency chart of accounts with real-time consolidation and intercompany elimination.
- **Accounts Payable / Receivable** — Standard AP/AR with support for milestone billing, progress payments, and long-cycle aerospace procurement terms.
- **Revenue Recognition** — ASC 606 / IFRS 15 engine handling: standalone selling prices for bundled hardware+capacity deals, variable consideration for usage-based contracts, contract modifications, and multi-year amortization schedules.
- **Multi-Currency** — Real-time rate management, hedge accounting support, and functional currency handling per subsidiary.
- **Fixed Assets** — Depreciation and impairment for ground stations, satellites (orbital life-based), and ground terminal inventory.
- **Tax Management** — Multi-jurisdictional tax compliance, VAT/GST handling, withholding tax for international contracts, and transfer pricing documentation support.

### 2. Procurement & Supply Chain

- **Vendor Management** — Qualified vendor lists with export-control status, ITAR registration tracking, and facility clearance records.
- **Purchase Orders** — Standard and blanket POs with support for milestone-based payment schedules typical of launch vehicle and satellite bus procurements.
- **Launch Vehicle Procurement** — Specialized workflows: launch service agreements, manifest slot management, insurance procurement, and launch window scheduling.
- **Component Tracking** — Lot/serial tracking with full genealogy for flight hardware, ITAR/EAR classification per line item, and country-of-origin tracking.
- **Inventory Management** — Multi-location warehouse management including bonded storage, ITAR-controlled facilities, and consignment at customer sites.

### 3. Sales & Commercial

- **Order Management** — Quote-to-cash for hardware sales (terminals, modems, antennas) and capacity services (transponder leases, managed bandwidth, hosted payloads).
- **Configure-Price-Quote (CPQ)** — Bundled pricing for hardware + installation + bandwidth + managed services, with contract-term-based discounting.
- **Contract Management** — Multi-year capacity contracts with renewal options, SLA tracking, usage metering, and automatic escalation clauses.
- **Customer Portal** — Self-service ordering for standard hardware, usage dashboards for capacity customers, and support ticket integration.

### 4. Orbital Asset Management

- **Satellite Registry** — Lifecycle tracking from design/manufacturing through launch, commissioning, operational life, and deorbiting/graveyard. Orbital parameters (TLE), transponder inventory, beam coverage maps.
- **Transponder & Beam Management** — Capacity inventory by satellite, beam, frequency, and polarization. Allocation tracking against customer contracts.
- **Ground Station Network** — Asset records for antennas, RF chains, and baseband equipment. Maintenance scheduling, availability tracking, and failover configuration.
- **Spectrum Management** — ITU filing status, national license inventory (by country, band, orbital slot), lease agreements, coordination status, and renewal tracking.

### 5. Export Control & Sanctions Compliance

- **Product Classification** — USML category / CCL ECCN assignment per item, with jurisdiction determination (ITAR vs. EAR).
- **License Management** — DSP-5, DSP-73, DSP-85, TAA, and BIS license tracking with expiration alerts, quantity/value drawdown, and provisos.
- **Denied-Party Screening** — Automated screening against OFAC SDN, Entity List, Denied Persons List, and allied-nation lists on every transaction (sales, procurement, shipping).
- **Deemed Export Control** — Personnel access tracking for foreign persons, technology control plans, and deemed export license management.
- **End-Use Monitoring** — End-use certificates, delivery verification, and post-shipment audit trails for defense articles.

### 6. Complex Delivery & Logistics

- **Restricted Destination Workflows** — Automated compliance checks and documentation requirements triggered by ship-to country. Special handling for:
  - **Sanctioned/partially-sanctioned territories** (e.g., Ukraine under evolving sanctions, Israel under certain export restrictions depending on end-use)
  - **Conflict zones** requiring diplomatic pouch, military logistics chains, or NGO coordination
  - **Remote/austere locations** with limited port infrastructure (island ground stations, polar sites, maritime platforms)
- **Customs & Documentation** — Automated generation of commercial invoices, packing lists, shipper's export declarations (SED/AES), certificates of origin, and carnet documents.
- **Freight Management** — Multi-modal shipping coordination (air freight for critical spares, ocean freight for bulk terminals, specialized transport for flight hardware).
- **Delivery Tracking** — End-to-end visibility from warehouse to customer site, including customs hold status, in-country forwarding, and proof of delivery with GPS/photo capture.

### 7. Program Management

- **Satellite Programs** — Work breakdown structures for satellite build programs with milestone tracking, earned value management (EVM), and cost-at-completion forecasting.
- **Milestone Billing** — Billing schedules tied to program milestones (PDR, CDR, integration, test, ship, launch, IOT, acceptance).
- **Resource Planning** — Engineering resource allocation across concurrent satellite programs and sustaining operations.

## Non-Functional Requirements

| Attribute | Target |
|-----------|--------|
| **Availability** | 99.9% uptime for core financial and order management |
| **Data Residency** | Configurable per-entity data residency to meet national requirements (EU, US, etc.) |
| **Audit Trail** | Immutable audit log for all transactions, compliant with SOX and ITAR recordkeeping (5-year retention minimum) |
| **Security** | NIST 800-171 alignment for CUI handling; role-based access with facility/program-level compartmentalization for ITAR data |
| **Scalability** | Support 50+ legal entities, 10,000+ active contracts, 1M+ inventory SKUs |
| **Integration** | REST/GraphQL APIs for all modules; webhook support; pre-built connectors for banking (SWIFT/ACH), shipping carriers, and satellite TT&C systems |
| **Localization** | Multi-language UI; locale-aware date/number/currency formatting; jurisdiction-specific tax and compliance rules |

## Design Principles

1. **Compliance is not optional** — Export control, sanctions screening, and regulatory compliance are woven into the transaction lifecycle, not bolted on as afterthoughts. The system should make it difficult to accidentally violate regulations.

2. **Domain-native, not generic-plus-customization** — Satellites, transponders, spectrum licenses, and launch vehicles are first-class entities with purpose-built workflows, not custom record types hacked onto a generic ERP.

3. **Multi-everything by default** — Multi-entity, multi-currency, multi-language, multi-jurisdiction from day one. Global operations are the norm, not an edge case.

4. **NetSuite-equivalent breadth** — Cover the same functional footprint as NetSuite (GL, AP, AR, inventory, order management, CRM basics, reporting) so operators can fully replace it, not supplement it.

5. **Open and extensible** — Open-source core with clean APIs. Operators can self-host, extend, and audit. No vendor lock-in for the system that runs your business.

6. **Auditability over convenience** — Every state change is logged. Approval workflows are enforced, not suggested. The system produces the evidence trail that regulators and auditors expect.

7. **Progressive complexity** — Simple operations (sell a modem, pay a vendor) should be simple. Complex operations (multi-year capacity bundle with milestone billing to a restricted destination) should be possible without leaving the system.

## Success Metrics

| Metric | Target | Timeframe |
|--------|--------|-----------|
| NetSuite functional parity (finance, procurement, sales, inventory) | Core modules operational | Phase 1 |
| Orbital asset and spectrum management integrated | Replaces standalone tracking tools | Phase 2 |
| Export control engine passing ITAR/EAR compliance audit | Zero screening gaps in automated testing | Phase 2 |
| Hardware delivery to restricted destinations without manual compliance workarounds | End-to-end automated workflow | Phase 3 |
| Multi-entity consolidation for 10+ legal entities | < 1 hour close cycle | Phase 3 |
| Full replacement of NetSuite for a reference operator | Production cutover | Phase 4 |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| ITAR/EAR compliance gap in export control engine | Regulatory violation, criminal liability | Engage ITAR counsel for requirements validation; automated compliance test suite against known scenarios |
| Sanctions landscape changes faster than system updates | Shipments to newly-sanctioned entities | Real-time screening list updates via OFAC/BIS feeds; manual hold queue for ambiguous matches |
| Revenue recognition complexity (ASC 606) | Audit findings, restatement risk | Engage Big 4 advisory for requirement validation; parallel-run with existing system during cutover |
| Scope creep from "NetSuite parity" goal | Never-ending Phase 1 | Define parity as the 80% of NetSuite features satellite operators actually use, validated by reference customer workflows |
| Open-source sustainability | Contributor attrition, maintenance burden | Dual-license model (open core + commercial support); prioritize operator self-sufficiency in architecture |

## Resolved Decisions

1. **Technology stack** — **TypeScript + Node.js**. Full-stack TypeScript for backend and frontend. Strong API/UI ecosystem, modern tooling, good contributor accessibility. Frontend framework TBD (likely React/Next.js).

2. **Deployment model** — **Self-hosted only**. Operators deploy on their own infrastructure or GovCloud. ITAR data never leaves operator control. This is the simplest compliance story and fits the defense-adjacent customer base. SaaS may be revisited post-Phase 1 if demand warrants.

3. **Reference operator** — **Hybrid GEO + LEO**. Phase 1 models both GEO comsat patterns (transponder leasing, long-term capacity contracts, large ground networks) and LEO constellation patterns (high-volume terminal sales, managed bandwidth, automated provisioning). Broadest applicability from the start.

4. **CRM scope** — **Full CRM**. Pipeline management, forecasting, campaign tracking, lead scoring — replacing Salesforce/HubSpot entirely. This is a significant scope addition but eliminates an external dependency and gives operators a single system.

5. **Integration priorities** — **Kratos first**. Kratos quantumCMD / epoch IPS connector for TT&C and satellite command & control. Widely used across GEO and LEO operators. Clean integration APIs designed from the start so additional connectors can follow.

---

*This document is the governing authority for SatERP. All downstream artifacts (PRD, feature specs, design documents, implementation) must align with the mission, principles, and domain model defined here.*
