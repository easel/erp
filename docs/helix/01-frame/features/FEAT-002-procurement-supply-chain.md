# FEAT-002: Procurement & Supply Chain

**Authority Level:** 3 (Governing)
**Status:** Draft
**Created:** 2026-04-04
**Governed by:** [PRD](../prd.md)

---

## Overview

The Procurement & Supply Chain module manages the full lifecycle of purchasing, inventory, and vendor relationships for a satellite operator that both manufactures integrated satellite systems and sells hardware (terminals, modems, antennas) to end users worldwide. Unlike a general-purpose procurement system, SatERP must handle launch vehicle procurement --- a multi-hundred-million-dollar process involving launch service agreements, manifest slot allocation, milestone payments, and insurance --- as a first-class workflow rather than a bolt-on.

Every item that flows through procurement carries export control implications. ITAR-controlled flight hardware and EAR-classified commercial components must be classified at the inventory item level, with that classification propagating automatically to purchase orders, goods receipts, and outbound shipments. Component genealogy must be maintained from raw material receipt through satellite integration, linking lot and serial numbers to build programs and ultimately to orbital assets. This traceability is not optional: it is a regulatory requirement for defense articles and a contractual requirement for most launch service providers.

## User Stories

### Purchase Orders

- **As a procurement specialist**, I want to create a purchase order from an approved vendor with line items, quantities, unit prices, and delivery dates, so that I can formalize a commitment to buy materials.
- **As a procurement manager**, I want to configure multi-step approval workflows (dollar thresholds, commodity type, ITAR classification), so that POs above certain thresholds or for controlled items require additional authorization.
- **As an AP clerk**, I want to match vendor invoices against POs and goods receipts (3-way match), so that we only pay for goods actually ordered and received.
- **As a procurement specialist**, I want to receive partial deliveries against a PO and track remaining open quantities, so that I can manage staggered vendor shipments.

### Vendor Management

- **As a procurement manager**, I want to maintain a vendor master record with legal name, contacts, payment terms, default currency, tax identifiers, and bank details, so that all vendor interactions reference a single source of truth.
- **As a compliance officer**, I want to record each vendor's ITAR registration status, facility security clearance level, and approved vendor list membership, so that procurement cannot issue POs to unqualified vendors for controlled items.
- **As a procurement manager**, I want to maintain vendor scorecards tracking on-time delivery, quality rejection rates, and pricing competitiveness, so that vendor performance is quantifiable and auditable.
- **As a procurement specialist**, I want the system to block PO creation for vendors who fail denied-party screening or whose ITAR registration has expired, so that compliance is enforced at the point of transaction.

### Inventory

- **As a warehouse manager**, I want to track inventory across multiple physical locations (clean rooms, bonded warehouses, ITAR-controlled vaults, field offices), so that I know where every item is at any time.
- **As a warehouse operator**, I want to assign lot numbers and serial numbers to received items and track them through consumption, so that I can trace any component back to its source.
- **As a planner**, I want to set minimum stock levels and reorder points per item per location, so that the system alerts me when stock falls below threshold.
- **As a warehouse manager**, I want to manage consignment inventory held at customer or partner sites with clear ownership tracking, so that stock on partner premises is visible without being counted as sold.

### Launch Vehicle Procurement

- **As a launch procurement manager**, I want to create and track launch service agreements (LSAs) with providers like SpaceX, Arianespace, and Rocket Lab, so that contract terms, pricing, and obligations are centrally managed.
- **As a launch procurement manager**, I want to manage manifest slots including primary and backup slots, co-manifest opportunities, and slot swap negotiations, so that launch scheduling is visible and auditable.
- **As a finance controller**, I want to define milestone payment schedules for launch contracts (e.g., contract signing, integration review, fueling, launch, successful orbit insertion), so that payments are triggered by verified milestone completion.
- **As a risk manager**, I want to track launch insurance policies linked to specific LSAs, including coverage amounts, premiums, deductibles, and policy periods, so that every launch has verified insurance coverage before proceeding.

### Component Tracking

- **As a quality engineer**, I want full component genealogy from raw material receipt through sub-assembly, integration, test, and installation into a satellite, so that any anomaly can be traced to its root component.
- **As a quality engineer**, I want to link finished satellite serial numbers to every lot and serial number consumed during manufacturing, so that component provenance is available for the life of the orbital asset.
- **As a compliance officer**, I want every inventory item tagged with its ITAR/EAR classification (USML category or ECCN), so that the export control status of any item is always known.
- **As a compliance officer**, I want ITAR/EAR classification to propagate automatically from inventory items to PO line items and shipping documents, so that controlled items are never shipped without proper documentation.

### Demand Planning

- **As a supply chain planner**, I want to run MRP calculations for terminal and hardware manufacturing based on sales forecasts, current inventory, and lead times, so that I can generate planned purchase orders and production schedules.
- **As a supply chain planner**, I want to manage bonded warehouse inventory with customs duty tracking and duty-paid conversion workflows, so that bonded stock is handled correctly from a regulatory and financial perspective.

## Acceptance Criteria

### SCM-001: Purchase Order Creation, Approval Workflows, Receipt Matching

*Traces to: PRD SCM-001*

| ID | Criterion |
|----|-----------|
| SCM-001-AC1 | A user with the `procurement.po.create` permission can create a PO with one or more line items, each specifying item, quantity, unit price, required delivery date, and ship-to location. |
| SCM-001-AC2 | Approval workflows are configurable by PO total value, line item commodity code, and ITAR classification level; a PO requiring approval cannot transition to `Approved` without all required approvals. |
| SCM-001-AC3 | The system supports at least three approval tiers (e.g., <$10K auto-approve, $10K-$100K manager, >$100K VP + compliance). |
| SCM-001-AC4 | 3-way matching compares PO line quantities and prices against goods receipt quantities and vendor invoice amounts; mismatches exceeding a configurable tolerance (default 2%) flag the invoice for review. |
| SCM-001-AC5 | Partial receipts update PO line status to `Partially Received`; full receipt transitions the line to `Received`. PO status reflects the aggregate of its lines. |
| SCM-001-AC6 | PO creation generates an immutable audit log entry containing the creating user, timestamp, all field values, and approval chain. |

### SCM-002: Vendor Master

*Traces to: PRD SCM-002*

| ID | Criterion |
|----|-----------|
| SCM-002-AC1 | A vendor record includes: legal name, DBA name, tax ID, primary contact, billing address, remittance address, default payment terms, default currency, tax configuration, and status (active/inactive/suspended). |
| SCM-002-AC2 | Multiple contacts per vendor are supported, each with role, email, phone, and notification preferences. |
| SCM-002-AC3 | Payment terms support net-N, percentage-discount-if-paid-within-N, and milestone-based schedules. |
| SCM-002-AC4 | A vendor cannot be set to `Active` status if their denied-party screening result is anything other than `Clear`. |

### SCM-003: Inventory Management

*Traces to: PRD SCM-003*

| ID | Criterion |
|----|-----------|
| SCM-003-AC1 | Inventory is tracked per item, per location, per lot/serial number; the system returns current on-hand, allocated, available, and in-transit quantities for any combination of these dimensions. |
| SCM-003-AC2 | Locations are hierarchical (site > building > room > bin) and support classification tags (ITAR-controlled, bonded, clean room, general). |
| SCM-003-AC3 | Lot tracking assigns a unique lot ID at goods receipt; serial tracking assigns a unique serial number per unit. Items can be configured as lot-tracked, serial-tracked, or untracked. |
| SCM-003-AC4 | Reorder points and minimum stock levels are configurable per item per location; the system generates alerts or automated purchase requisitions when available stock falls below the reorder point. |
| SCM-003-AC5 | Stock level changes produce audit log entries linking the change to the source transaction (PO receipt, sales order shipment, inventory adjustment, transfer). |

### SCM-004: Goods Receipt and Putaway

*Traces to: PRD SCM-004*

| ID | Criterion |
|----|-----------|
| SCM-004-AC1 | Goods receipt can be performed against a PO; the system validates received quantities against PO line open quantities and flags over-receipts. |
| SCM-004-AC2 | Barcode and QR code scanning is supported for item identification, lot/serial capture, and bin assignment during receipt and putaway. Supported barcode formats for goods receipt scanning: Code 128, Code 39, QR Code, and Data Matrix. Input via keyboard-emulating scanner or camera-based scanning in the UI. |
| SCM-004-AC3 | Putaway suggests a target bin based on item storage rules (ITAR classification, temperature requirements, item category) and allows operator override. |
| SCM-004-AC4 | A completed goods receipt automatically updates inventory on-hand and triggers AP matching against the corresponding PO. |

### SCM-005: Blanket Purchase Orders

*Traces to: PRD SCM-005*

| ID | Criterion |
|----|-----------|
| SCM-005-AC1 | A blanket PO defines a vendor, item or item category, total quantity or value commitment, unit pricing, and validity period. |
| SCM-005-AC2 | Releases against a blanket PO specify delivery quantities and dates; the system tracks cumulative releases against the blanket commitment. |
| SCM-005-AC3 | The system prevents releases that would exceed the blanket PO's total quantity or value without explicit override and additional approval. |
| SCM-005-AC4 | Blanket POs support price escalation schedules (e.g., annual price adjustments per contract terms). |

### SCM-006: Launch Vehicle Procurement

*Traces to: PRD SCM-006*

| ID | Criterion |
|----|-----------|
| SCM-006-AC1 | A Launch Service Agreement (LSA) record captures: launch provider, vehicle type, contract value, contract date, target launch window, primary and backup orbital parameters, and contractual terms. |
| SCM-006-AC2 | Manifest slots are tracked per LSA with status values: `Reserved`, `Confirmed`, `Integration`, `Fueled`, `Launched`, `Successful Orbit Insertion`, `Failed`, and `Cancelled`. |
| SCM-006-AC3 | Milestone payment schedules are defined per LSA with payment amounts and trigger conditions; milestone completion triggers a payment request that flows to AP. |
| SCM-006-AC4 | Insurance policies are linked to LSAs with coverage type (pre-launch, launch, in-orbit), coverage amount, premium, deductible, insurer, and policy period. The system alerts if an LSA reaches `Integration` status without an active insurance policy. |
| SCM-006-AC5 | LSA records link to the satellite program (via Program Management module) and the satellite asset (via Orbital Asset Management) once launched. |

### SCM-007: Vendor Qualification

*Traces to: PRD SCM-007*

| ID | Criterion |
|----|-----------|
| SCM-007-AC1 | An Approved Vendor List (AVL) can be maintained per commodity code or item category; the system warns or blocks PO creation for vendors not on the relevant AVL, based on configuration. |
| SCM-007-AC2 | Vendor scorecards compute scores from on-time delivery rate, quality acceptance rate, pricing competitiveness, and responsiveness, with configurable weights. |
| SCM-007-AC3 | ITAR registration status (registered, exempt, not applicable) and registration expiration date are tracked per vendor; the system blocks POs for ITAR-classified items to vendors with expired or missing ITAR registration. |
| SCM-007-AC4 | Facility clearance records (e.g., DD Form 254) are stored per vendor with clearance level and expiration; the system warns on PO creation if the vendor's clearance is insufficient for the item's classification. |

### SCM-008: Component Genealogy

*Traces to: PRD SCM-008*

| ID | Criterion |
|----|-----------|
| SCM-008-AC1 | The system maintains a directed acyclic graph (DAG) of component relationships: raw material lots are consumed into sub-assemblies, sub-assemblies into assemblies, assemblies into a finished satellite. |
| SCM-008-AC2 | Given a satellite serial number, the system returns the complete bill of materials tree with lot/serial numbers, vendor, PO, receipt date, and inspection status for every component. BOM tree retrieval for a satellite with up to 50,000 components completes within 10 seconds. |
| SCM-008-AC3 | Given a component lot or serial number, the system returns all satellites and sub-assemblies that consumed units from that lot (forward traceability). |
| SCM-008-AC4 | Genealogy records are immutable; corrections are recorded as adjustment entries that reference the original record. |
| SCM-008-AC5 | Component genealogy links to the build program (via Program Management) and the orbital asset (via Orbital Asset Management) for the satellite's full operational life. |

### SCM-009: ITAR/EAR Classification per Inventory Item

*Traces to: PRD SCM-009*

| ID | Criterion |
|----|-----------|
| SCM-009-AC1 | Every inventory item has an export classification field set with jurisdiction (ITAR or EAR), classification (USML category or ECCN), and classification rationale. |
| SCM-009-AC2 | When a PO is created for a classified item, the PO line automatically inherits the item's classification; the PO header displays the highest classification level across all lines. |
| SCM-009-AC3 | Shipping documents generated from classified POs include the required export control markings and statements. |
| SCM-009-AC4 | Changes to an item's classification are audit-logged and trigger a review of all open POs and shipments containing that item. |

### SCM-010: Consignment Inventory

*Traces to: PRD SCM-010*

| ID | Criterion |
|----|-----------|
| SCM-010-AC1 | Consignment inventory is tracked at customer or partner sites with a distinct ownership status (`Operator-owned at customer site`). |
| SCM-010-AC2 | Consignment stock appears in inventory reports but is excluded from available-to-sell calculations until ownership transfers. |
| SCM-010-AC3 | Ownership transfer (consignment to sold) generates the corresponding financial transaction (revenue recognition and COGS). |

### SCM-011: Bonded Warehouse and ITAR-Controlled Storage

*Traces to: PRD SCM-011*

| ID | Criterion |
|----|-----------|
| SCM-011-AC1 | Storage facilities can be tagged as `Bonded`, `ITAR-Controlled`, or both; access control rules enforce that only users with appropriate clearance can view or transact against ITAR-controlled locations. |
| SCM-011-AC2 | Bonded warehouse inventory tracks customs entry numbers, duty amounts, and duty-paid status; duty payment triggers a financial journal entry. |
| SCM-011-AC3 | Transfer of items from an ITAR-controlled location to a non-controlled location requires compliance officer approval and generates an audit log entry. |

### SCM-012: Demand Planning and MRP

*Traces to: PRD SCM-012*

| ID | Criterion |
|----|-----------|
| SCM-012-AC1 | MRP calculates net requirements from gross demand (sales forecasts + open sales orders) minus supply (on-hand + open POs + planned production) for each item. |
| SCM-012-AC2 | MRP generates planned purchase requisitions for bought-out items and planned production orders for manufactured items, respecting lead times and lot-sizing rules. |
| SCM-012-AC3 | Demand sources include manual forecasts, open sales orders, and blanket order release schedules. |
| SCM-012-AC4 | MRP results can be reviewed and approved before conversion to actual purchase requisitions or production orders. |

## Domain Model

### Key Entities

| Entity | Description |
|--------|-------------|
| **PurchaseOrder** | Header with vendor reference, status, approval chain, currency, and payment terms. Contains one or more `PurchaseOrderLine` items. |
| **PurchaseOrderLine** | Line item specifying `InventoryItem`, quantity, unit price, delivery date, ship-to location, and export classification (inherited from item). |
| **BlanketPurchaseOrder** | Long-term purchase commitment with total quantity/value cap, pricing terms, validity period, and linked releases. |
| **Vendor** | Master record for a supplier. Links to contacts, bank details, payment terms, AVL memberships, scorecards, and ITAR registration records. |
| **VendorQualification** | AVL membership, scorecard data, ITAR registration status, and facility clearance records for a vendor. |
| **InventoryItem** | SKU-level master record: description, UOM, item category, export classification (jurisdiction, USML/ECCN), storage requirements, and tracking mode (lot, serial, none). |
| **InventoryBalance** | On-hand quantity for a specific item + location + lot/serial combination. |
| **Lot** | Batch identifier assigned at goods receipt, linking to vendor, PO, receipt date, and inspection status. |
| **SerialNumber** | Unit-level identifier for serial-tracked items, with full lifecycle status (received, in-stock, allocated, installed, shipped, scrapped). |
| **GoodsReceipt** | Transaction recording receipt of items against a PO, with line-level lot/serial assignment and putaway location. |
| **Location** | Hierarchical storage location (site > building > room > bin) with classification tags (ITAR, bonded, clean room). |
| **LaunchServiceAgreement** | Contract with a launch provider: vehicle type, contract value, launch window, orbital parameters, and status. Links to `ManifestSlot`, milestone payments, and insurance policies. |
| **ManifestSlot** | A reserved position on a specific launch vehicle/mission for a specific satellite, with lifecycle status from reservation through orbit insertion. |
| **MilestonePayment** | A scheduled payment tied to an LSA milestone (signing, integration review, launch, orbit insertion) with amount, due condition, and AP linkage. |
| **InsurancePolicy** | Launch or in-orbit insurance policy linked to an LSA, with coverage details, premium, and validity period. |
| **ComponentGenealogy** | DAG structure recording parent-child relationships between lots/serials as components are consumed into higher-level assemblies. |
| **ExportClassification** | ITAR/EAR classification record for an inventory item: jurisdiction, category/ECCN, rationale, effective date, and classification authority. |

### Key Relationships

```
Vendor 1──* PurchaseOrder
PurchaseOrder 1──* PurchaseOrderLine
PurchaseOrderLine *──1 InventoryItem
InventoryItem 1──1 ExportClassification
InventoryItem 1──* InventoryBalance
InventoryBalance *──1 Location
InventoryBalance *──0..1 Lot
InventoryBalance *──0..1 SerialNumber
PurchaseOrder 1──* GoodsReceipt
GoodsReceipt 1──* Lot
Lot *──* ComponentGenealogy (as parent or child)
SerialNumber *──* ComponentGenealogy (as parent or child)
Vendor 1──* VendorQualification
LaunchServiceAgreement *──1 Vendor
LaunchServiceAgreement 1──* ManifestSlot
LaunchServiceAgreement 1──* MilestonePayment
LaunchServiceAgreement 1──* InsurancePolicy
BlanketPurchaseOrder 1──* PurchaseOrder (releases)
```

## Key Workflows

### Purchase Order Lifecycle

```
[Requisition] ──> [PO Draft] ──> [Pending Approval] ──> [Approved] ──> [Sent to Vendor]
                                       │                                     │
                                       v                                     v
                                  [Rejected]                      [Partially Received]
                                                                       │
                                                                       v
                                                                  [Fully Received]
                                                                       │
                                                                       v
                                                              [3-Way Match Complete]
                                                                       │
                                                                       v
                                                                   [Closed]
```

1. **Requisition** (optional): A user or MRP run creates a purchase requisition.
2. **PO Draft**: Procurement creates a PO, selecting vendor, line items, and delivery terms.
3. **Pending Approval**: The system evaluates approval rules based on PO value, commodity, and ITAR classification, then routes to the required approvers.
4. **Approved**: All required approvals are obtained. The PO is transmittable to the vendor.
5. **Sent to Vendor**: The PO is transmitted (email, EDI, or API). The vendor acknowledges.
6. **Partially Received / Fully Received**: Goods receipt transactions record incoming items with lot/serial assignment and putaway.
7. **3-Way Match Complete**: The vendor invoice is matched against PO and goods receipt; discrepancies are resolved.
8. **Closed**: All lines are received, matched, and paid. The PO is archived.

### Launch Vehicle Procurement

```
[RFP Issued] ──> [Proposals Evaluated] ──> [LSA Negotiated] ──> [LSA Signed]
                                                                      │
                                                          ┌───────────┴───────────┐
                                                          v                       v
                                                 [Manifest Slot Reserved]  [Insurance Procured]
                                                          │
                                                          v
                                                 [Integration Review]
                                                          │
                                                          v
                                                 [Satellite Delivery to Launch Site]
                                                          │
                                                          v
                                                 [Fueling & Final Checkout]
                                                          │
                                                          v
                                                      [Launch]
                                                          │
                                              ┌───────────┴───────────┐
                                              v                       v
                                   [Successful Orbit Insertion]   [Failure]
                                              │                       │
                                              v                       v
                                   [LSA Closed / Asset Created]  [Insurance Claim]
```

1. **RFP Issued**: The operator issues a request for proposal to launch providers (SpaceX, Arianespace, Rocket Lab, ULA, etc.), specifying orbit, mass, schedule constraints, and co-manifest willingness.
2. **Proposals Evaluated**: Proposals are scored on price, schedule, technical fit, reliability record, and insurance cost.
3. **LSA Negotiated / Signed**: Contract terms are finalized. The LSA record is created with milestone payment schedule.
4. **Manifest Slot Reserved**: A slot on a specific mission is reserved. Backup slots may be reserved on alternative missions.
5. **Insurance Procured**: Pre-launch and launch insurance policies are obtained and linked to the LSA.
6. **Integration Review through Launch**: Milestones are tracked; each milestone triggers the corresponding payment request to AP.
7. **Successful Orbit Insertion**: The satellite is delivered to its target orbit. The LSA is closed. The satellite record in Orbital Asset Management transitions to `Commissioning`.
8. **Failure**: If the launch fails, the insurance claim process is initiated and the LSA is closed with a `Failed` status.

### Goods Receipt with ITAR Classification Check

1. **Receive Shipment**: Warehouse operator scans the PO barcode or enters the PO number.
2. **Item Identification**: Each item is scanned or entered; the system displays the item's export classification.
3. **ITAR Check**: If the item is ITAR-classified, the system verifies that the receiving location is ITAR-controlled and that the receiving operator has appropriate clearance. If either check fails, the receipt is blocked.
4. **Lot/Serial Assignment**: The operator assigns or scans lot and serial numbers.
5. **Putaway**: The system suggests a storage bin matching the item's classification and storage requirements. The operator confirms or overrides.
6. **Completion**: Inventory is updated. The goods receipt is linked to the PO. AP matching is triggered.

### Component Genealogy Tracing

1. **Forward Trace (Lot/Serial to Satellite)**: Given a component lot or serial number, the system traverses the genealogy DAG upward to find all assemblies and satellites that consumed that component. Use case: a vendor issues a recall on a capacitor lot; the operator needs to know which satellites are affected.
2. **Backward Trace (Satellite to Components)**: Given a satellite serial number, the system traverses the genealogy DAG downward to return the complete as-built bill of materials with lot/serial, vendor, PO, and inspection records for every component. Use case: a satellite experiences an anomaly; the operator investigates component provenance.
3. **Lateral Trace (Sibling Components)**: Given a component, find all other components from the same lot that were used in other assemblies. Use case: determine blast radius of a suspect lot across the fleet.

## Integration Points

### Export Control & Sanctions Compliance (FEAT-006)

- **Classification propagation**: Inventory item ITAR/EAR classifications (SCM-009) are consumed by the Export Control module (EXP-001) for jurisdiction determination on every transaction.
- **Denied-party screening**: Vendor records are screened against denied-party lists (EXP-002) at vendor creation and on every PO creation. Screening failures trigger transaction holds (EXP-003).
- **License drawdown**: POs for export-controlled items decrement against the applicable export license quantity and value limits (EXP-005).
- **End-use certificates**: POs to foreign vendors for defense articles generate end-use certificate requirements (EXP-007).

### Financial Management (FEAT-001)

- **Accounts Payable**: Approved POs and completed 3-way matches generate AP vouchers. Launch milestone payments flow to AP as payment requests (FIN-003).
- **General Ledger**: Goods receipts create inventory accrual journal entries. Inventory adjustments post to appropriate GL accounts (FIN-002).
- **Multi-currency**: POs in foreign currencies are converted using configured exchange rates. Realized gain/loss is calculated at payment (FIN-005).
- **Fixed Assets**: Launch vehicle payments and satellite manufacturing costs feed into the satellite asset's capitalized cost basis (FIN-009).

### Program Management (FEAT-008)

- **Build program linkage**: Component genealogy traces (SCM-008) link to the satellite build program via the program's work breakdown structure (PGM-001).
- **Milestone alignment**: Launch procurement milestones (SCM-006) align with program milestones (PGM-002) for integrated schedule tracking.
- **Cost tracking**: PO costs are allocated to programs for cost-at-completion forecasting (PGM-006).

### Orbital Asset Management (FEAT-005)

- **Satellite lifecycle**: Successful launch (SCM-006) transitions the satellite record from `Integration` to `Launch` to `Commissioning` in the orbital asset registry (OAM-001).
- **Component genealogy**: The as-built BOM (SCM-008) is linked to the orbital asset for the satellite's operational life, supporting anomaly investigation and end-of-life disposition.

### Sales & Commercial (FEAT-003)

- **Inventory availability**: Sales order promising checks available inventory (SCM-003) for hardware orders (SLS-002).
- **Demand signal**: Open sales orders feed into MRP demand calculations (SCM-012).

### Complex Delivery & Logistics (FEAT-007)

- **Shipment classification**: Outbound shipments inherit ITAR/EAR classification from inventory items (SCM-009) and trigger appropriate customs documentation (LOG-002) and restricted destination checks (LOG-003).
- **Warehouse operations**: Pick, pack, and ship workflows (LOG-001) consume inventory balances managed by this module.

## Open Design Questions

1. **Genealogy granularity for commercial terminals**: Full component genealogy (SCM-008) is clearly required for flight hardware. Should the same granularity apply to commercial terminals (modems, antennas), or is lot-level traceability sufficient for non-flight hardware? This affects data volume and warehouse process complexity significantly.

2. **MRP scope boundary with MES**: The PRD explicitly excludes Manufacturing Execution Systems (MES). Where exactly does MRP (SCM-012) end and MES begin? Specifically, does SatERP generate production orders and track their completion, or does it stop at planned production orders that are handed off to an external MES?

3. **Launch provider integration**: Should the system support API-based integration with launch providers for manifest updates and milestone status, or is manual entry sufficient? SpaceX and Arianespace have different (and largely proprietary) processes for manifest management.

4. **Consignment inventory accounting method**: For consignment inventory at customer sites (SCM-010), should ownership transfer be triggered by customer consumption reporting, by elapsed time, or by explicit operator action? The accounting treatment differs for each approach.

5. **Bonded warehouse duty optimization**: Should the system support duty optimization logic (e.g., recommending which bonded stock to release based on duty rates and trade agreements), or is basic bonded tracking sufficient for Phase 1?

6. **Vendor scorecard data sources**: Should vendor scorecards (SCM-007) be computed solely from SatERP transaction data (PO delivery dates, quality inspections), or should they integrate external data sources (D&B ratings, financial health indicators)?

7. **ITAR classification inheritance for assemblies**: When components with different ITAR classifications are assembled together, should the resulting assembly automatically inherit the most restrictive classification, or must a compliance officer explicitly classify each assembly? The ITAR "see-through rule" may apply in some cases but not others.

---

*This feature specification is governed by the [PRD](../prd.md). All design and implementation decisions for the Procurement & Supply Chain module must trace requirements back to this document.*
