# FEAT-007: Complex Delivery & Logistics

**Authority Level:** 3 (Governing)
**Status:** Draft
**Created:** 2026-04-04
**Governed by:** [PRD](../prd.md)

---

## Overview

Satellite operators deliver hardware -- terminals, modems, antennas, ground station equipment, RF assemblies -- to some of the most challenging destinations on Earth. Customers operate in conflict zones (Ukraine, Israel), sanctioned or restricted territories, remote island ground stations, polar monitoring sites, and maritime platforms. Standard carrier integrations are not sufficient; a single shipment may require diplomatic clearance, military logistics coordination, ATA Carnet documentation, multi-modal freight across air/ocean/ground, and GPS-verified proof of delivery before the corresponding AR invoice can be released.

This module handles the full logistics chain from warehouse pick through final delivery confirmation, with export compliance checks enforced at every gate. It works hand-in-hand with FEAT-006 (Export Control & Sanctions Compliance) to ensure no hardware leaves without validated classification, screening, and licensing. It also integrates tightly with Sales (fulfillment triggers), Financial Management (freight cost allocation, duty accruals, AR reconciliation), and Procurement (inbound receipt and RMA processing).

The design assumes that "normal" shipments (domestic US, allied-nation commercial) and "complex" shipments (conflict zone, restricted destination, remote/austere site) flow through the same workflow engine, with complexity injected by destination classification rules rather than parallel codepaths.

---

## User Stories

### Pick / Pack / Ship

- **As a warehouse operator**, I want to receive a pick list generated from a sales order so that I can locate, verify, and stage the correct items for shipment.
- **As a warehouse operator**, I want to scan serial numbers during packing so that the shipment record captures the exact units shipped and component genealogy is maintained.
- **As a shipping clerk**, I want to select a carrier and service level, generate a shipping label, and capture the tracking number in the system so that downstream tracking begins immediately.
- **As a shipping manager**, I want to configure carrier accounts (FedEx, UPS, DHL, freight forwarders, military logistics providers) so that rate shopping and label generation work across all our shipping methods.

### Customs Documentation

- **As a shipping clerk**, I want the system to auto-generate a commercial invoice, packing list, and shipper's export declaration from the sales order and shipment data so that I do not have to re-key information.
- **As a compliance officer**, I want AES (Automated Export System) filing data pre-populated from the product classification and shipment details so that I can review and submit electronically.
- **As a shipping clerk**, I want the system to flag when a shipment requires a specific export license and block label generation until the license reference is attached so that we never ship without authorization.

### Restricted Destinations

- **As a compliance officer**, I want the system to automatically escalate shipments to sanctioned, embargoed, or restricted-end-use countries through an approval workflow so that no restricted shipment proceeds without documented authorization.
- **As a compliance officer**, I want to configure destination classifications (unrestricted, restricted, sanctioned, conflict zone) per country and have those classifications drive documentation and approval requirements.
- **As an export compliance manager**, I want a dashboard showing all shipments currently held for restricted-destination review so that I can prioritize and clear the queue.

### Conflict Zone Delivery

- **As a program manager delivering to Ukraine**, I want workflows that track diplomatic clearance requests, military logistics coordination, and special carrier arrangements so that I have visibility into every step of a conflict-zone delivery.
- **As a program manager delivering to Israel**, I want to record defense ministry coordination, port authority pre-clearance, and security-cleared carrier selection as structured workflow steps.
- **As a logistics coordinator**, I want to track NGO or government agency partnerships that facilitate last-mile delivery in conflict zones so that we can reuse established channels.
- **As a compliance officer**, I want conflict-zone shipments to require both export compliance approval and operational security review before release.

### Multi-Modal Freight

- **As a logistics coordinator**, I want to plan multi-leg shipments (e.g., air to regional hub, ground to port, ocean to island) with per-leg carrier, cost, and transit time tracking.
- **As a logistics coordinator**, I want to compare freight options across air, ocean, and ground for cost, transit time, and risk so that I can recommend the optimal routing.
- **As a finance analyst**, I want freight costs allocated to the correct cost center and GL account per shipment leg so that landed cost is accurate.

### Delivery Tracking

- **As a customer success manager**, I want end-to-end shipment visibility from warehouse departure to customer site delivery, including customs hold status and in-country forwarding, so that I can proactively communicate with the customer.
- **As a logistics coordinator**, I want automated status updates from carrier APIs and manual status entry for legs where API tracking is unavailable (military logistics, NGO handoff).
- **As a shipping manager**, I want alerts when a shipment is held in customs beyond a configurable threshold so that I can intervene.

### Proof of Delivery

- **As a field technician**, I want to capture GPS coordinates and a photo at the delivery site so that proof of delivery is recorded with location and visual confirmation.
- **As an AR analyst**, I want proof of delivery to automatically trigger invoice release or AR status update so that billing is not delayed by manual confirmation.
- **As an auditor**, I want proof-of-delivery records (GPS, photo, timestamp, signer) to be immutable and linked to the shipment and invoice.

### Remote Site Logistics

- **As a logistics coordinator**, I want to create delivery plans for remote/austere sites (island ground stations, polar sites, maritime platforms) that account for seasonal access windows, charter transport requirements, and staging locations.
- **As a logistics coordinator**, I want to track charter vessel or aircraft bookings, landing permits, and port/airstrip availability as part of the shipment workflow.
- **As a program manager**, I want cost estimates for remote site delivery that include charter transport, staging, and on-site labor so that quotes reflect true delivery cost.

---

## Acceptance Criteria

### LOG-001: Shipping Execution (P0)

1. A confirmed sales order with shippable lines generates a pick list assigned to a warehouse location.
2. Warehouse operator can scan item serial/lot numbers during packing; mismatched serials are rejected.
3. Carrier selection presents configured carrier accounts with rate estimates (where carrier API supports it).
4. Label generation produces a carrier-compliant shipping label and captures the tracking number on the shipment record.
5. Shipment cannot be confirmed if any line item has an unresolved export compliance hold (integration with FEAT-006).
6. Shipment confirmation triggers inventory deduction and updates the sales order fulfillment status.

### LOG-002: Customs Documentation (P0)

1. Commercial invoice is auto-generated from shipment data: seller, buyer, item descriptions, HS codes, values, quantities, weights, country of origin.
2. Packing list is auto-generated with per-package contents, dimensions, and weights.
3. AES filing data (SED replacement) is pre-populated with ECCN/USML classification, license type, destination, and value; exportable to AESDirect or equivalent.
4. Documents are stored as immutable records linked to the shipment.
5. If a required export license is not attached to the shipment, customs document generation is blocked with a clear error.

### LOG-003: Restricted Destination Workflows (P1)

1. Each country in the system has a configurable destination classification: unrestricted, restricted, sanctioned, conflict zone.
2. Shipments to restricted or sanctioned destinations automatically enter a hold state and trigger an approval workflow.
3. The approval workflow requires documented justification, compliance officer sign-off, and (for sanctioned destinations) legal counsel sign-off.
4. Additional documentation requirements (end-use certificates, government authorizations) are enforced per destination classification.
5. Approved restricted-destination shipments carry an immutable audit record of the approval chain.
6. Denied shipments are cancelled with a reason code and notification to the sales order owner.

### LOG-004: Conflict Zone Delivery (P1)

1. Conflict zone destinations (e.g., Ukraine, Israel) have configurable delivery workflow templates that include: diplomatic clearance, military logistics coordination, NGO/agency partnership selection, special carrier assignment, and operational security review.
2. Each workflow step has an assignee, due date, status, and completion evidence (document upload or sign-off).
3. Shipment cannot proceed to the next logistics phase until all required conflict-zone workflow steps are complete.
4. The system tracks which in-country logistics partners and carriers are approved for each conflict zone.
5. Conflict zone shipments require dual approval: export compliance and operational security.

### LOG-005: Multi-Modal Freight Management (P1)

1. A shipment can have multiple freight legs, each with: mode (air, ocean, ground), carrier, origin, destination, cost, estimated transit time, and actual transit time.
2. Freight bookings can be created and linked to shipment legs with booking reference, vessel/flight, and departure/arrival dates.
3. Total freight cost is calculated as the sum of leg costs and posted to the GL with configurable account mapping.
4. Transit time estimates are calculated from leg estimates and displayed on the shipment record.
5. Actual vs. estimated cost and transit time variance is tracked for carrier performance reporting.

### LOG-006: Delivery Tracking (P1)

1. Shipment status is updated automatically via carrier API polling for supported carriers.
2. Manual status updates are supported for legs without API tracking (military handoff, NGO relay, charter transport).
3. Customs hold status is a distinct tracking state with hold reason and estimated clearance date.
4. In-country forwarding (handoff to local carrier or logistics partner) is tracked as a distinct leg.
5. Customer-facing shipment status is available via API (and later via customer portal, SLS-009).
6. Configurable alerts fire when: shipment is delivered, shipment is held in customs beyond threshold, shipment is overdue vs. estimated delivery.

### LOG-007: Proof of Delivery (P2)

1. Delivery confirmation captures: GPS coordinates, photo(s), timestamp, recipient name, and signature (where applicable).
2. Proof-of-delivery data is stored as an immutable record linked to the shipment.
3. Successful proof of delivery triggers an event that can be consumed by AR for invoice release or status update.
4. Proof of delivery is viewable on the shipment record and the linked sales order.

### LOG-008: Carnet & Temporary Import/Export (P2)

1. ATA Carnet documents can be created and linked to shipments for temporary export/import of equipment (demo units, trade show equipment, field service tools).
2. Carnet records track: issuing chamber, countries of transit, expiration date, item list with values, and re-importation status.
3. Alerts fire when a carnet is approaching expiration or when re-importation has not been confirmed within a configurable window.
4. Carnet items are tracked separately from permanent inventory movements; temporary exports do not trigger revenue recognition.

### LOG-009: Remote/Austere Site Delivery Planning (P2)

1. Delivery plans for remote sites include: seasonal access windows, charter transport requirements (vessel, aircraft), staging locations, landing permits, and on-site labor coordination.
2. Remote site profiles are configurable with: location coordinates, access constraints, available transport modes, preferred staging points, and lead time requirements.
3. Cost estimates for remote delivery include charter transport, staging, customs (if international), and on-site labor.
4. The system flags when a delivery is planned outside a site's access window or when required permits are missing.

---

## Domain Model

### Core Entities

| Entity | Description |
|--------|-------------|
| **Shipment** | Top-level logistics record linking a sales order (or RMA) to a physical delivery. Holds destination, status, carrier, and compliance clearance state. |
| **ShipmentLine** | Line item within a shipment, referencing the sales order line, product, quantity, serial/lot numbers, and HS code. |
| **ShipmentPackage** | Physical package within a shipment with dimensions, weight, and contents (ShipmentLines). |
| **CarrierAccount** | Configured carrier with API credentials, account numbers, and supported service levels (FedEx, UPS, DHL, military logistics, charter). |
| **CarrierService** | A specific service level offered by a carrier (e.g., FedEx International Priority, DHL Express Worldwide). |
| **FreightLeg** | One segment of a multi-modal shipment: mode, carrier, origin, destination, cost, transit time. |
| **FreightBooking** | A booking with a carrier for a freight leg: booking reference, vessel/flight, departure, arrival. |
| **CustomsDocument** | Generated document linked to a shipment: commercial invoice, packing list, AES filing, end-use certificate. |
| **RestrictedDestinationRule** | Configuration record mapping a country to a destination classification and associated documentation/approval requirements. |
| **ConflictZoneWorkflow** | Workflow template for conflict-zone deliveries with configurable steps (diplomatic clearance, military coordination, etc.). |
| **ConflictZoneWorkflowStep** | Individual step instance within a conflict-zone delivery: assignee, status, evidence, completion date. |
| **DeliveryConfirmation** | Proof-of-delivery record: GPS coordinates, photos, timestamp, recipient, signature. |
| **Carnet** | ATA Carnet record with issuing chamber, country list, expiration, item list, and re-import status. |
| **RemoteSiteProfile** | Configuration for a remote/austere delivery destination: coordinates, access windows, transport constraints, staging points. |
| **DeliveryPlan** | Logistics plan for a remote site delivery: transport bookings, permits, staging, labor, cost estimate. |

### Key Relationships

```
SalesOrder 1──* Shipment 1──* ShipmentLine
                           1──* ShipmentPackage 1──* ShipmentLine
                           1──* FreightLeg 1──0..1 FreightBooking
                           1──* CustomsDocument
                           0..1── ConflictZoneWorkflow 1──* ConflictZoneWorkflowStep
                           0..1── DeliveryConfirmation
                           0..1── Carnet
                           0..1── DeliveryPlan

CarrierAccount 1──* CarrierService
CarrierAccount 1──* FreightLeg

RestrictedDestinationRule ──> Country
RemoteSiteProfile ──> Location
```

---

## Key Workflows

### 1. Standard Hardware Shipment

```
Sales Order Confirmed
  --> Pick list generated (warehouse assignment)
  --> Warehouse pick (scan items, verify serial/lot)
  --> Pack (assign to packages, capture dimensions/weight)
  --> Export compliance gate (FEAT-006: screening, classification, license check)
  --> Customs document generation (commercial invoice, packing list, AES data)
  --> Carrier selection & label generation
  --> Ship confirmation (tracking number captured, inventory deducted)
  --> In-transit tracking (carrier API polling)
  --> Delivered (carrier confirms delivery)
  --> [Optional] Proof of delivery (GPS, photo)
  --> AR reconciliation (invoice release or status update)
```

### 2. Restricted Destination Shipment

```
Sales Order Confirmed (ship-to country = restricted or sanctioned)
  --> Standard pick/pack
  --> Export compliance gate (enhanced: license verification, end-use certificate)
  --> HOLD: Restricted destination approval workflow triggered
      --> Compliance officer review & justification
      --> [Sanctioned] Legal counsel sign-off
      --> Additional documentation attached (government authorizations, end-use certs)
      --> Approval or denial recorded (immutable audit)
  --> [If approved] Customs document generation (with additional restricted-destination docs)
  --> Carrier selection (may be limited to approved carriers for destination)
  --> Ship confirmation
  --> Enhanced tracking (manual updates if carrier API unavailable)
  --> Delivery confirmation
```

### 3. Conflict Zone Delivery (Ukraine / Israel / Similar)

```
Sales Order Confirmed (ship-to country = conflict zone)
  --> Standard pick/pack
  --> Export compliance gate (FEAT-006)
  --> Restricted destination approval workflow
  --> HOLD: Conflict zone workflow initiated (from country-specific template)
      --> Diplomatic clearance request submitted & tracked
      --> Military logistics coordination (transport assignment, convoy scheduling)
      --> NGO/agency partnership confirmed (if applicable)
      --> Special carrier or military logistics provider assigned
      --> Operational security review & approval
      --> All workflow steps complete with evidence
  --> Customs document generation (including diplomatic/military documentation)
  --> Freight booking (may be military transport, charter, or specialized carrier)
  --> Ship confirmation
  --> Tracking (manual + automated where available; military handoff as distinct status)
  --> In-country forwarding (local logistics partner, military last-mile)
  --> Delivery confirmation (GPS/photo proof of delivery)
  --> AR reconciliation
```

### 4. Remote / Austere Site Delivery

```
Sales Order Confirmed (ship-to = remote site profile)
  --> Delivery plan created from remote site profile
      --> Seasonal access window verified
      --> Charter transport booked (vessel, aircraft)
      --> Landing permits / port clearance obtained
      --> Staging location and schedule confirmed
      --> On-site labor coordinated
      --> Cost estimate finalized
  --> Standard pick/pack
  --> Export compliance gate (if international)
  --> Customs documentation (if international)
  --> Multi-modal freight execution
      --> Leg 1: Commercial carrier to staging point
      --> Leg 2: Charter transport to remote site
  --> Tracking (per-leg, manual for charter legs)
  --> Delivery confirmation (GPS/photo)
  --> AR reconciliation
```

### 5. Return / RMA Processing

```
RMA Authorized (from sales order or support case)
  --> Return shipment label generated (or customer arranges return)
  --> Inbound tracking
  --> Goods receipt at warehouse (scan serial/lot, condition inspection)
  --> Customs clearance (if international return)
  --> [If Carnet] Re-importation recorded, carnet updated
  --> Inventory update (return to stock, quarantine, or scrap)
  --> Credit memo or replacement order triggered
```

---

## Integration Points

### Internal Modules

| Module | Integration | Direction |
|--------|-------------|-----------|
| **Sales (FEAT-003)** | Sales order fulfillment triggers shipment creation; shipment status updates sales order status; delivery confirmation can trigger invoice release. | Bidirectional |
| **Export Control (FEAT-006)** | Every shipment passes through export compliance screening before release. Product classification, denied-party results, and license references are consumed by logistics. Restricted destination rules are co-managed. | Bidirectional |
| **Financial Management (FEAT-001)** | Freight costs posted to GL; duty and tax accruals on import; AR reconciliation on delivery confirmation; landed cost calculation. | Logistics --> Finance |
| **Procurement (FEAT-002)** | Inbound goods receipt (PO receiving) uses shared warehouse operations. RMA returns follow return receipt workflow. | Bidirectional |
| **Inventory (FEAT-002)** | Pick operations check and reserve inventory; ship confirmation deducts inventory; returns update inventory. Serial/lot tracking shared. | Bidirectional |
| **Platform (FEAT-009)** | Workflow engine drives approval workflows. Audit log captures all logistics events. RBAC controls access to compliance-sensitive operations. Notifications for shipment events. | Logistics --> Platform |

### External Systems

| System | Integration | Method |
|--------|-------------|--------|
| **Carrier APIs** (FedEx, UPS, DHL, etc.) | Rate quotes, label generation, tracking status polling. | REST API (outbound) |
| **AESDirect / ACE** | Electronic export information filing. | File export or API (outbound) |
| **Freight Forwarders** | Booking requests, status updates for ocean/air freight. | API or EDI (bidirectional) |
| **Military Logistics Systems** | Coordination for conflict-zone deliveries; typically manual with structured data exchange. | Manual / secure file transfer |
| **Customs Brokers** | Documentation submission, clearance status. | API or EDI (bidirectional) |
| **GPS/Mobile Capture** | Proof-of-delivery data from field devices. | REST API (inbound) |

---

## Non-Functional Requirements

| ID | Requirement | Rationale |
|----|-------------|-----------|
| NFR-LOG-001 | All shipment state transitions must be captured in the immutable audit log with actor, timestamp, and prior state. | ITAR recordkeeping; SOX compliance for financial-impacting events. |
| NFR-LOG-002 | Carrier API credentials must be stored encrypted and never exposed in logs or API responses. | Security best practice; carrier account protection. |
| NFR-LOG-003 | Customs documents must be immutable once generated; amendments create new versions with linked history. | Regulatory requirement; customs document integrity. |
| NFR-LOG-004 | Proof-of-delivery records (GPS, photos) must be immutable and tamper-evident. | Audit and dispute resolution. |
| NFR-LOG-005 | The system must function for manual shipment processing (no label generation, manual tracking entry) when carrier APIs are unavailable. | Self-hosted environments may have restricted connectivity (constraint C5). |
| NFR-LOG-006 | Conflict-zone workflow templates must be configurable without code changes. | New conflict zones or policy changes must not require a release (risk R6). |

---

## Open Design Questions

1. **Carrier API abstraction:** Should we build a carrier adapter layer in-house or integrate an existing multi-carrier API (e.g., EasyPost, Shippo)? In-house gives full control (important for self-hosted/air-gapped deployments) but is more work. A pluggable adapter interface that supports both strategies may be the right approach.

2. **AES filing integration:** Direct API integration with ACE/AESDirect vs. generating a file for manual upload. Direct integration is faster but adds an external dependency that may not be available in all deployment environments.

3. **Conflict zone workflow extensibility:** How much of the conflict-zone workflow should be template-driven (configurable steps, assignees, evidence requirements) vs. hard-coded per destination? The PRD risk R6 suggests configuration over code.

4. **Proof of delivery mobile experience:** Native mobile app vs. PWA vs. simple mobile web form for field technicians capturing GPS and photos. Given the "no mobile app" out-of-scope statement in the PRD, a responsive web form or PWA seems appropriate.

5. **Military logistics integration:** Is there a standard or semi-standard data exchange format for coordinating shipments through military logistics channels, or is this inherently manual and ad-hoc per destination?

6. **Carnet lifecycle management:** Should the system actively manage carnet lifecycle (applications, renewals, re-importation deadlines) or simply track carnets created externally? Active management adds value but increases scope.

7. **Remote site profile ownership:** Who maintains remote site profiles -- the logistics team, the program manager, or the ground station operations team? This affects RBAC configuration and data governance.

8. **Freight cost allocation granularity:** Should freight costs be allocated at the shipment level, the shipment line level, or the package level? Line-level allocation enables more accurate landed cost per item but adds complexity.

---

*This feature spec is governed by the [PRD](../prd.md) and traces to requirements LOG-001 through LOG-009 in section 3.7 (Complex Delivery & Logistics). All design and implementation artifacts for this module must trace back to this document.*
