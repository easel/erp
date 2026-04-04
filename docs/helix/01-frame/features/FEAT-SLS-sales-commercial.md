# FEAT-SLS: Sales & Commercial

**Authority Level:** 3 (Governing)
**Status:** Draft
**Created:** 2026-04-04
**Governed by:** [PRD](../prd.md)

---

## Overview

SatERP's Sales & Commercial module handles two distinct revenue models for satellite operators:

1. **Hardware sales** -- terminals, modems, antennas, and ancillary equipment sold outright or as part of managed-service bundles. High-volume in LEO constellations; lower-volume, higher-value in GEO.
2. **Capacity services** -- transponder leases, managed bandwidth agreements, and usage-based connectivity. Multi-year contracts with SLA commitments, escalation clauses, and renewal cycles.

The module spans the full quote-to-cash lifecycle: catalog and pricing management, quoting with approval workflows, order fulfillment, contract execution, milestone and usage-based billing, and renewal processing. It integrates tightly with CRM (pipeline to quote handoff), Financial Management (invoicing, revenue recognition), Export Control (screening on every order), and Orbital Asset Management (capacity allocation against transponder/beam inventory).

Both GEO and LEO business models are first-class citizens. A GEO operator leasing 36 MHz transponder segments on a 15-year satellite has fundamentally different commercial workflows than a LEO operator selling 50,000 terminals with bundled managed bandwidth -- the module must handle both without mode-switching.

## User Stories

### Order Management

- **US-SLS-OM-01:** As a sales operations analyst, I want to create a quote with multiple line items (hardware, services, capacity) so that I can present a single commercial proposal to the customer.
- **US-SLS-OM-02:** As a sales manager, I want to review and approve quotes that exceed discount thresholds so that pricing governance is enforced before commitments reach the customer.
- **US-SLS-OM-03:** As a sales operations analyst, I want to convert an approved quote into a sales order so that fulfillment can begin without re-entering data.
- **US-SLS-OM-04:** As a warehouse manager, I want to see open sales orders with allocated inventory so that I can plan pick, pack, and ship operations.
- **US-SLS-OM-05:** As a finance analyst, I want sales orders to generate invoices automatically upon shipment confirmation so that billing is timely and accurate.
- **US-SLS-OM-06:** As a customer service representative, I want to process returns and generate credit memos linked to the original order so that the customer's account balance is correct.

### Configure-Price-Quote (CPQ)

- **US-SLS-CPQ-01:** As a sales representative, I want to configure a bundle of hardware, installation, bandwidth, and managed services so that I can present a single price to the customer for a turnkey solution.
- **US-SLS-CPQ-02:** As a pricing analyst, I want to define term-based discount schedules (1-year, 3-year, 5-year) so that longer commitments are automatically priced lower.
- **US-SLS-CPQ-03:** As a sales representative, I want the CPQ engine to validate configurations (e.g., terminal model compatibility with target satellite band) so that I don't quote invalid combinations.

### Contract Management

- **US-SLS-CM-01:** As a contracts manager, I want to create multi-year capacity contracts with defined SLA parameters (uptime, latency, throughput) so that contractual obligations are tracked in the system.
- **US-SLS-CM-02:** As a contracts manager, I want to define escalation clauses (annual price increases, CPI-linked adjustments) so that billing automatically reflects contractual terms over the life of the agreement.
- **US-SLS-CM-03:** As a capacity planning analyst, I want contracts linked to specific transponder/beam allocations so that I can see remaining available capacity per satellite.

### Customer Portal

- **US-SLS-CP-01:** As a customer, I want to log into a self-service portal to place hardware orders, view invoices, and check shipment status so that I don't need to contact sales operations for routine transactions.
- **US-SLS-CP-02:** As a capacity customer, I want to view real-time bandwidth usage dashboards so that I can monitor consumption against my contracted allocation.

### Usage Billing

- **US-SLS-UB-01:** As a billing analyst, I want to ingest metered bandwidth usage data and apply tiered pricing rules so that invoices accurately reflect consumption.
- **US-SLS-UB-02:** As a billing analyst, I want overage charges calculated automatically when a customer exceeds their contracted bandwidth tier so that revenue is captured without manual intervention.

### Partners

- **US-SLS-PR-01:** As a channel manager, I want to manage partner/reseller accounts with deal registration, margin tracking, and co-sell workflows so that indirect sales are properly attributed and compensated.
- **US-SLS-PR-02:** As a partner, I want to register deals in the system so that my margin is protected and the operator's direct sales team is aware of my pipeline.

## Acceptance Criteria

### SLS-001: Quote Creation

- AC-SLS-001-01: User can create a quote with one or more line items, each referencing a product catalog entry or free-text description.
- AC-SLS-001-02: Each line item supports quantity, unit price, discount (percentage or absolute), and extended price calculation.
- AC-SLS-001-03: Quotes support configurable approval workflows triggered by discount percentage, total value, or customer-specific rules.
- AC-SLS-001-04: Approved quotes are versioned; prior versions are retained as immutable history.
- AC-SLS-001-05: Quotes can be printed or exported as PDF with configurable templates.

### SLS-002: Sales Order Management

- AC-SLS-002-01: An approved quote can be converted to a sales order with a single action; all line items, pricing, and terms carry forward.
- AC-SLS-002-02: Sales orders track fulfillment status per line item (open, partially shipped, fully shipped, invoiced, closed).
- AC-SLS-002-03: Invoices are generated automatically upon shipment confirmation or on a manual trigger.
- AC-SLS-002-04: Returns create return material authorizations (RMAs) linked to the original order and generate credit memos on receipt.
- AC-SLS-002-05: Every sales order triggers denied-party screening and export classification checks before release to fulfillment.

### SLS-003: Customer Master

- AC-SLS-003-01: Customer records support multiple legal entities with separate billing addresses, shipping addresses, payment terms, and credit limits per entity.
- AC-SLS-003-02: Parent/child account relationships are modeled (e.g., a conglomerate with regional subsidiaries).
- AC-SLS-003-03: Customer records link to CRM company records for pipeline visibility.
- AC-SLS-003-04: Credit limit enforcement prevents order entry when outstanding AR plus new order value exceeds the limit.

### SLS-004: Hardware Product Catalog

- AC-SLS-004-01: Products are defined with SKU, description, ECCN/USML classification, weight, dimensions, and lead time.
- AC-SLS-004-02: Pricing supports multiple price lists (standard, government, partner) with effective-date ranges.
- AC-SLS-004-03: Availability is shown on the quote/order screen based on current inventory and lead time.
- AC-SLS-004-04: Products can be marked active, discontinued, or restricted (requiring override to sell).

### SLS-005: CPQ

- AC-SLS-005-01: Bundles can be defined as combinations of hardware products, installation services, bandwidth capacity, and managed services.
- AC-SLS-005-02: Bundle pricing supports term-based discounting (e.g., 10% off 3-year, 20% off 5-year).
- AC-SLS-005-03: Configuration rules prevent invalid combinations (e.g., Ku-band terminal with C-band-only satellite).
- AC-SLS-005-04: Bundle components flow through to separate fulfillment streams (hardware to warehouse, capacity to provisioning, services to project management).

### SLS-006: Capacity Contract Management

- AC-SLS-006-01: Capacity contracts define allocated bandwidth or transponder segments, term dates, SLA parameters, and pricing.
- AC-SLS-006-02: Contracts link to specific transponder/beam allocations in Orbital Asset Management.
- AC-SLS-006-03: SLA tracking records uptime, latency, and throughput against contractual thresholds.
- AC-SLS-006-04: Escalation clauses (annual increases, CPI-linked) are modeled and automatically applied at billing time.
- AC-SLS-006-05: Usage metering data is ingested and reconciled against contracted allocations.

### SLS-007: Milestone Billing

- AC-SLS-007-01: Billing schedules can be defined with milestones (delivery, program milestone, or calendar date) and percentage or fixed-amount splits.
- AC-SLS-007-02: Milestone completion triggers invoice generation automatically or queues for manual review.
- AC-SLS-007-03: Milestone billing integrates with Program Management milestones (PDR, CDR, ship, launch, acceptance).
- AC-SLS-007-04: Revenue recognition schedules align with billing milestones per ASC 606 / IFRS 15 rules.

### SLS-008: Renewal Management

- AC-SLS-008-01: Contracts approaching expiration trigger automated renewal notices at configurable lead times (e.g., 180, 90, 30 days).
- AC-SLS-008-02: Renewal workflows support extension (same terms), re-pricing (new terms), or non-renewal paths.
- AC-SLS-008-03: Renewal quotes are pre-populated with current contract terms for rapid processing.
- AC-SLS-008-04: Renewal pipeline is visible in CRM and sales forecasting.

### SLS-009: Customer Self-Service Portal

- AC-SLS-009-01: Authenticated customers can browse the hardware catalog and place orders.
- AC-SLS-009-02: Customers can view their invoices, payment history, and current account balance.
- AC-SLS-009-03: Customers can track shipment status for open orders.
- AC-SLS-009-04: Capacity customers can view usage dashboards showing bandwidth consumption against allocation.

### SLS-010: Usage-Based Billing

- AC-SLS-010-01: Metered usage data is ingested from provisioning or monitoring systems on a configurable schedule.
- AC-SLS-010-02: Tiered pricing rules are applied: base rate up to commitment, overage rate above.
- AC-SLS-010-03: Usage invoices are generated on a configurable cycle (monthly, quarterly).
- AC-SLS-010-04: Usage data is reconcilable against raw meter records for dispute resolution.

### SLS-011: Partner/Reseller Management

- AC-SLS-011-01: Partner accounts are distinct from direct customer accounts with separate pricing, margin, and commission structures.
- AC-SLS-011-02: Deal registration creates a protected pipeline entry with expiration.
- AC-SLS-011-03: Co-sell workflows allow joint pursuit with visibility into partner and direct activities.
- AC-SLS-011-04: Partner margin reports are generated per deal and in aggregate.

## Domain Model

| Entity | Description |
|--------|-------------|
| **Quote** | Commercial proposal with line items, pricing, terms, and approval status. Versioned. |
| **QuoteLineItem** | Single item on a quote: product, quantity, unit price, discount, extended price. |
| **SalesOrder** | Committed order derived from an approved quote. Tracks fulfillment and invoicing. |
| **SalesOrderLineItem** | Line on a sales order with fulfillment status (open, shipped, invoiced, returned). |
| **Product** | Catalog entry for hardware, service, or capacity offering. Carries ECCN/USML classification. |
| **PriceList** | Named set of prices (standard, government, partner) with effective-date ranges. |
| **PriceListEntry** | Price for a specific product on a specific price list. |
| **Bundle** | CPQ configuration grouping multiple products/services with combined pricing rules. |
| **CapacityContract** | Multi-year agreement for transponder lease or managed bandwidth with SLA terms. |
| **BillingSchedule** | Milestone or calendar-based billing plan attached to an order or contract. |
| **BillingMilestone** | Individual milestone within a billing schedule with trigger, amount, and status. |
| **UsageMeter** | Metered usage record for bandwidth consumption, linked to a capacity contract. |
| **ReturnAuthorization** | RMA record linked to original order, tracking returned goods and credit memo issuance. |
| **Partner** | Reseller/channel partner account with margin structure and deal registration rules. |
| **DealRegistration** | Partner-registered deal with protection window and margin terms. |

## Key Workflows

### Quote-to-Cash (Hardware)

1. Sales rep creates quote with hardware line items from catalog.
2. Pricing engine applies price list and any volume/partner discounts.
3. Quote enters approval workflow if discount exceeds threshold.
4. Approved quote is sent to customer.
5. Customer accepts; quote converts to sales order.
6. Sales order triggers export compliance screening (denied-party, classification, country restrictions).
7. Cleared order releases to warehouse for fulfillment (pick, pack, ship).
8. Shipment confirmation triggers invoice generation.
9. AR processes payment; order closes.

### Capacity Contract Lifecycle (GEO Transponder Lease)

1. Sales rep creates quote for transponder capacity (e.g., 36 MHz on Satellite-X, Ku-band, 5-year term).
2. Capacity planning confirms availability in Orbital Asset Management.
3. Quote includes SLA terms, escalation clauses, and billing schedule.
4. Contract is executed; capacity allocation is recorded against the transponder/beam.
5. Monthly/quarterly billing runs per contract terms, applying escalation clauses as scheduled.
6. SLA monitoring tracks uptime and throughput against contractual thresholds.
7. Renewal workflow triggers at configurable lead time before expiration.

### LEO Terminal Sale with Managed Bandwidth Bundle

1. Sales rep uses CPQ to configure bundle: terminal hardware + installation + managed bandwidth (e.g., 50 Mbps committed, 100 Mbps burst, 3-year term).
2. CPQ validates terminal compatibility with target constellation and service plan.
3. Term-based discount applied (3-year commitment = 15% discount).
4. Order splits into fulfillment streams: hardware to warehouse, bandwidth to provisioning, installation to project management.
5. Hardware ships; installation is scheduled.
6. Bandwidth provisioning activates usage metering.
7. Monthly invoices combine fixed service fee + metered overage charges.

### Milestone Billing

1. Contracts manager defines billing schedule with milestones (e.g., 30% on contract signing, 20% on PDR, 20% on CDR, 20% on delivery, 10% on acceptance).
2. Program Management milestone completion events trigger billing milestones.
3. Invoice is generated automatically or queued for review upon milestone completion.
4. Revenue recognition aligns billing events with performance obligations per ASC 606.

### Renewal Processing

1. System generates renewal notice 180 days before contract expiration.
2. Account manager reviews contract performance, usage, and customer health score.
3. Renewal quote is generated with current terms or re-priced terms.
4. Customer negotiates; revised quote goes through approval workflow.
5. Executed renewal extends or replaces the existing contract.
6. Capacity allocation and billing schedules update accordingly.

## Integration Points

| System | Direction | Data |
|--------|-----------|------|
| **CRM (FEAT-CRM)** | Bidirectional | Opportunity-to-quote handoff; customer master sync; renewal pipeline visibility |
| **Financial Management (FEAT-FIN)** | Outbound | Invoice generation, revenue recognition schedules, credit memo posting |
| **Export Control (FEAT-EXP)** | Outbound/Inbound | Denied-party screening requests, classification lookups, hold/release signals |
| **Orbital Asset Management (FEAT-OAM)** | Bidirectional | Capacity availability queries, allocation commits, usage metering data |
| **Logistics (FEAT-LOG)** | Outbound | Fulfillment release, shipping instructions, customs documentation data |
| **Program Management (FEAT-PGM)** | Inbound | Milestone completion events for milestone billing triggers |
| **Inventory (FEAT-SCM)** | Bidirectional | Stock availability for quoting, allocation on order, receipt for returns |

## Open Design Questions

1. **Shared vs. separate customer master:** Should the customer master be owned by CRM or Sales, or should it be a shared entity at the platform level? The PRD references customer records in both CRM-001 (contact/company management) and SLS-003 (customer master). Need to resolve ownership and sync model.

2. **Usage metering architecture:** Should usage data be pulled from external monitoring systems on a schedule, or should the billing module expose an API for real-time usage event ingestion? Latency, volume, and dispute resolution requirements need to drive this decision.

3. **CPQ rule engine complexity:** How complex do configuration rules need to be at launch? Simple compatibility matrices, or full constraint-based solving (e.g., maximum terminals per beam, frequency coordination constraints)?

4. **Multi-currency on capacity contracts:** When a capacity contract spans multiple years with escalation clauses, should the escalation be in the contract currency or can it reference a different index currency? How does this interact with FX gain/loss on multi-currency AR?

5. **Partner portal vs. customer portal:** Should partners and direct customers share the same self-service portal with role-based views, or should they be separate applications?
