# FEAT-006: Export Control & Sanctions Compliance

**Authority Level:** 3 (Governing)
**Status:** Draft
**Created:** 2026-04-04
**Governed by:** [PRD](../prd.md)

---

## Overview

Export Control & Sanctions Compliance is the most compliance-critical module in SatERP. Satellite hardware, components, and related technical data are heavily regulated under ITAR (International Traffic in Arms Regulations, 22 CFR 120-130) and EAR (Export Administration Regulations, 15 CFR 730-774). The operator conducts significant business in conflict areas -- notably Ukraine and Israel -- and must screen every transaction against multiple government-maintained denied-party and sanctions lists.

The system must make it **difficult to accidentally violate regulations**. ITAR violations carry criminal penalties of up to $1M per violation and 20 years imprisonment; civil penalties up to $500K per violation. EAR violations carry comparable penalties. This module therefore enforces compliance -- it does not merely suggest it. Export compliance checks cannot be bypassed or disabled (Constraint C4).

Every sales order, purchase order, and shipment must pass automated compliance screening before it can proceed. Compliance failures result in automatic transaction holds that require explicit compliance officer authorization to release. The immutable audit trail captures every screening result, classification decision, and override for regulatory examination and voluntary self-disclosure.

This module is P0 and ships in Phase 1 (classification, denied-party screening, transaction holds, country restrictions, and automated screening list ingestion). Phase 2 adds license management, end-use certificates, and the immutable audit trail. Phase 3 adds deemed export control, compliance reporting, and sanctions scenario modeling.

### Regulatory Framework

| Regulation | Administering Agency | Scope |
|-----------|---------------------|-------|
| ITAR (22 CFR 120-130) | DDTC (State Dept) | Defense articles and services on the US Munitions List (USML) |
| EAR (15 CFR 730-774) | BIS (Commerce Dept) | Dual-use items on the Commerce Control List (CCL) |
| OFAC Sanctions | OFAC (Treasury Dept) | Country-based and list-based sanctions programs |
| EU Dual-Use Regulation | EU Commission | Dual-use items for EU-entity transactions |

---

## User Stories

### Product Classification

- **As a product manager,** I want to assign a USML category or CCL ECCN to every product/part in the catalog so that the system knows which regulatory regime applies and what authorizations are required for export.
- **As a compliance officer,** I want the system to determine jurisdiction (ITAR vs. EAR) automatically based on the classification so that misclassification errors are caught early.
- **As a compliance officer,** I want to be alerted when a product has no classification assigned so that no unclassified item can be included in an order or shipment.
- **As an engineer,** I want to see the current classification of any item I am working with so that I understand its export restrictions without needing to consult the compliance team for every question.

### Denied-Party Screening

- **As a sales rep,** I want every customer, end-user, and intermediary on my order to be automatically screened against all applicable denied-party lists so that I never unknowingly transact with a prohibited party.
- **As a procurement specialist,** I want every vendor and their sub-tier suppliers screened on PO creation so that the company does not procure from denied or restricted parties.
- **As a compliance officer,** I want to review potential matches (fuzzy matches, alias matches, partial name matches) in a screening queue so that I can confirm or dismiss each match with an auditable decision.
- **As a compliance officer,** I want the screening engine to check all known aliases, alternate spellings, and transliterations so that bad actors using name variations are still caught.
- **As a shipping coordinator,** I want the system to re-screen all parties on a shipment at the time of shipment (not just at order entry) so that newly added parties since order creation are caught.

### Transaction Holds

- **As a compliance officer,** I want any transaction that fails screening or lacks required export authorization to be automatically placed on hold so that no regulated item leaves without proper clearance.
- **As a compliance officer,** I want to review held transactions in a dedicated compliance queue with all relevant context (screening results, classification, destination, end-use) so that I can make an informed release or rejection decision.
- **As a compliance officer,** I want my release or rejection decision to be recorded with my identity, timestamp, and rationale so that there is an unimpeachable audit trail.
- **As a sales manager,** I want to see which of my orders are on compliance hold and their current status so that I can set customer expectations and plan around delays.
- **As a system administrator,** I want it to be impossible to configure the system to skip compliance holds so that the enforcement mechanism cannot be accidentally or deliberately weakened (Constraint C4).

### Country Restrictions

- **As a compliance officer,** I want to configure country-based restriction rules (embargo, partial embargo, license required, caution) so that orders and shipments to restricted destinations trigger the appropriate compliance workflow.
- **As a sales rep,** I want to be warned immediately at order entry if the ship-to country triggers any restriction so that I know before quoting whether the deal requires special authorization.
- **As a logistics coordinator,** I want the system to block shipment creation for embargoed destinations unless an explicit license or authorization is on file so that no hardware ships to a prohibited country by accident.
- **As a compliance officer,** I want to maintain per-country rules that account for the distinction between comprehensive sanctions (e.g., North Korea, Iran) and selective sanctions (e.g., Russia sectoral sanctions) so that the system enforces the correct level of restriction for each destination.

### Sub-Country / Region-Level Sanctions

- **As a compliance officer,** I need the system to distinguish between shipments to government-controlled Ukraine vs. Crimea/Donetsk/Luhansk, because sanctions differ by region within the same country.
- **As a compliance officer,** I want to configure region-level restriction rules independently from their parent country so that sub-national sanctions regimes (e.g., Crimea embargoed while mainland Ukraine is unrestricted) are enforced correctly.
- **As a logistics coordinator,** I want the system to parse shipping addresses and match them against restricted sub-national regions so that shipments are automatically flagged when the destination falls within a sanctioned territory.
- **As a compliance officer,** I want addresses that cannot be definitively resolved to a restricted or non-restricted region to be routed to a manual review queue so that ambiguous destinations are never shipped to without human judgment.
- **As a compliance officer,** I want to maintain a registry of sub-national restricted regions with their geographic boundaries, applicable sanctions programs, and effective dates so that the region restriction data is auditable and current.

### License Management

- **As a compliance officer,** I want to track all active export licenses (DSP-5 for permanent export, DSP-73 for temporary export, DSP-85 for brokering, TAAs, BIS licenses) in a single registry so that I know what authorizations the company holds.
- **As a compliance officer,** I want each license to track its value limit, quantity limit, expiration date, and provisos so that the system can automatically determine whether a proposed transaction is within the license scope.
- **As a compliance officer,** I want the system to automatically draw down against the appropriate license when a transaction is shipped so that license utilization is tracked in real time.
- **As a compliance officer,** I want to receive alerts when a license is approaching its expiration date or utilization limit so that I can initiate a renewal or amendment in time.

### End-Use Certificates

- **As a compliance officer,** I want to generate end-use/end-user certificates from templates that capture the required information (item description, end-use statement, consignee, country, non-transfer clause) so that the documentation is complete and consistent.
- **As a compliance officer,** I want to link end-use certificates to specific sales orders and shipments so that the regulatory paper trail is maintained.
- **As a compliance officer,** I want to track certificate status (draft, issued, signed by customer, archived) so that I know which certificates are pending customer action.

### Deemed Exports

- **As a facility security officer,** I want to track which foreign persons have access to ITAR-controlled technology so that deemed export requirements are met.
- **As a compliance officer,** I want to manage technology control plans (TCPs) that define what controlled technology a foreign person may access and under what conditions so that access is properly bounded.
- **As an HR administrator,** I want the system to flag when a foreign national is assigned to an ITAR-controlled program so that the compliance team can assess whether a deemed export license is required.

### Compliance Reporting

- **As a compliance officer,** I want to generate ITAR annual compliance reports from system data so that the DDTC reporting requirement is met with minimal manual effort.
- **As a compliance officer,** I want to generate BIS semi-annual utilization reports for active BIS licenses so that reporting obligations are met.
- **As a compliance officer,** I want the system to support voluntary self-disclosure preparation by providing a complete audit trail of the relevant transactions, screening results, and decisions so that disclosure is thorough and defensible.

---

## Acceptance Criteria

### EXP-001: Product Classification Engine

| ID | Criterion |
|----|-----------|
| EXP-001-AC01 | Every item in the product catalog has a `classification` record with fields: jurisdiction (ITAR / EAR / not controlled), USML category (I-XXI) or CCL ECCN (e.g., 9A515.a.1), and classification basis (self-classification, commodity jurisdiction determination, DDTC advisory opinion) |
| EXP-001-AC02 | Items without a classification record cannot be added to a sales order line, purchase order line, or shipment line; the system returns a validation error with a message identifying the unclassified item |
| EXP-001-AC03 | Jurisdiction determination is automatic: if the USML category is populated, jurisdiction is ITAR; if ECCN is populated and begins with a digit, jurisdiction is EAR; if ECCN is EAR99, jurisdiction is EAR (minimal controls); if both are populated, the system raises a conflict for compliance review |
| EXP-001-AC04 | Classification changes create a new version; the previous classification is retained in history with the user who changed it, the timestamp, and the reason for change |
| EXP-001-AC05 | The classification record supports a `notes` field for recording CJ (Commodity Jurisdiction) determination references, DDTC case numbers, or BIS advisory opinion numbers |
| EXP-001-AC06 | Bulk classification import is supported via CSV with validation: each row must include item ID, jurisdiction, and either USML category or ECCN; rows with validation errors are rejected with line-number-specific error messages |
| EXP-001-AC07 | The classification engine exposes an API endpoint (`GET /api/export-control/classifications/{itemId}`) that returns the current classification for integration with other modules |

### EXP-002: Denied-Party Screening

| ID | Criterion |
|----|-----------|
| EXP-002-AC01 | On creation or update of a sales order, purchase order, or shipment, the system automatically screens all named parties (customer, vendor, ship-to, end-user, consignee, intermediary, freight forwarder) against all active screening lists |
| EXP-002-AC02 | Screening lists include at minimum: OFAC SDN List, OFAC Consolidated Non-SDN List, BIS Entity List, BIS Denied Persons List, BIS Unverified List, and at least one allied-nation restricted list (e.g., UK, EU, or Australian consolidated lists) |
| EXP-002-AC03 | Screening uses fuzzy matching that accounts for: alternate transliterations (e.g., Cyrillic-to-Latin variants), common aliases, partial name matches, and phonetic similarity; the fuzzy match threshold is configurable by the compliance officer |
| EXP-002-AC04 | Each screening produces a `ScreeningResult` record with: transaction reference, party screened, lists checked, match/no-match result per list, match score for fuzzy matches, and timestamp |
| EXP-002-AC05 | A match (exact or above-threshold fuzzy) triggers an automatic transaction hold (see EXP-003) and queues the match for compliance officer review |
| EXP-002-AC06 | Screening results are retained for a minimum of 5 years, consistent with Constraint C3 |
| EXP-002-AC07 | Screening cannot be skipped or deferred; a transaction without a completed screening result cannot advance to the next workflow state (e.g., order confirmed, PO approved, shipment released) |
| EXP-002-AC08 | Re-screening is triggered automatically when: (a) a screening list is updated, (b) a party name or address on an open transaction is modified, or (c) a transaction reaches the shipment stage |
| EXP-002-AC09 | The screening engine processes a single party against all lists in under 2 seconds for up to 500,000 total list entries |

### EXP-003: Transaction Hold

| ID | Criterion |
|----|-----------|
| EXP-003-AC01 | When a denied-party screening returns a match, the transaction is placed in `compliance_hold` status automatically; no user action can prevent the hold from being applied |
| EXP-003-AC02 | When a transaction involves a classified item (ITAR or EAR) and lacks a valid, unexpired export license with sufficient remaining value/quantity (if a license is required for that classification + destination combination), the transaction is placed in `compliance_hold` |
| EXP-003-AC03 | Held transactions appear in a dedicated Compliance Hold Queue accessible only to users with the `compliance_officer` or `compliance_admin` role |
| EXP-003-AC04 | A compliance officer can release a hold by providing: a disposition (cleared - false positive, cleared - license on file, cleared - license exception applies, rejected), a free-text rationale, and optionally a linked license or authorization record |
| EXP-003-AC05 | A compliance officer can reject a held transaction, which moves it to `compliance_rejected` status; rejected transactions cannot be reactivated without creating a new transaction |
| EXP-003-AC06 | Hold release and rejection are recorded in the immutable audit trail with the compliance officer's identity, timestamp, disposition, and rationale |
| EXP-003-AC07 | The hold mechanism cannot be disabled through any system configuration, API call, or database-level change; it is enforced in application logic and validated by integration tests that assert holds are applied even when configuration flags are manipulated (Constraint C4) |
| EXP-003-AC08 | Transactions that have been on hold for more than a configurable number of days (default: 5) trigger an escalation notification to the compliance manager |

### EXP-004: Country-Based Restriction Rules

| ID | Criterion |
|----|-----------|
| EXP-004-AC01 | The system maintains a `CountryRestriction` table with fields: ISO 3166-1 country code, restriction level (embargoed, heavily restricted, license required, caution, unrestricted), applicable sanctions program(s), and effective/expiration dates |
| EXP-004-AC02 | Pre-loaded country data covers all current US comprehensive sanctions programs (Cuba, Iran, North Korea, Syria, the Crimea/Donetsk/Luhansk regions) and sectoral sanctions (Russia, Belarus, Myanmar, etc.) |
| EXP-004-AC03 | When a sales order or shipment destination matches a country with restriction level `embargoed`, the transaction is blocked (cannot be saved) unless a specific OFAC license number is provided |
| EXP-004-AC04 | When a sales order or shipment destination matches a country with restriction level `license_required`, the transaction is placed on compliance hold pending license verification |
| EXP-004-AC05 | Country restriction checks run at both order entry and shipment creation; a country that becomes restricted between order entry and shipment triggers a new hold |
| EXP-004-AC06 | The system supports sub-country restrictions (e.g., Crimea region within Ukraine) using a secondary region field, so that shipments to non-restricted regions of a partially restricted country are not unnecessarily blocked |
| EXP-004-AC07 | Country restriction rule changes are versioned and audited; a compliance officer must provide a reason and regulatory reference when changing a country's restriction level |

### EXP-012: Region-Aware Sanctions Handling

| ID | Criterion |
|----|-----------|
| EXP-012-AC01 | The system maintains a `RegionRestriction` registry of sub-national restricted territories, each with: parent country code (ISO 3166-1), region identifier, region name, geographic boundary definition (list of administrative divisions or GeoJSON polygon), restriction level, applicable sanctions program(s), effective date, and expiration date |
| EXP-012-AC02 | Pre-loaded region data covers all current US sub-national sanctions programs: Crimea, so-called Donetsk People's Republic, and so-called Luhansk People's Republic regions of Ukraine |
| EXP-012-AC03 | On order entry and shipment creation, the system parses the destination address and attempts to resolve it to a specific sub-national region; if the resolved region matches a restricted territory, the applicable restriction level is enforced (embargo, hold, or caution) |
| EXP-012-AC04 | When an address cannot be definitively resolved to either a restricted or non-restricted region (ambiguous address), the transaction is placed on compliance hold with hold reason `AMBIGUOUS_REGION` and routed to the compliance officer manual review queue |
| EXP-012-AC05 | The compliance officer can resolve an ambiguous-region hold by confirming the address is in a non-restricted area (with rationale) or confirming it is in a restricted area (triggering the appropriate restriction workflow) |
| EXP-012-AC06 | Region restriction records are versioned and audited with the same controls as country restriction records (EXP-004-AC07) |
| EXP-012-AC07 | The system supports both administrative-division-based matching (e.g., matching against a list of oblast/raion names) and coordinate-based matching (geocoded address checked against a GeoJSON boundary) to maximize coverage across address formats |

### EXP-005: Export License Management

| ID | Criterion |
|----|-----------|
| EXP-005-AC01 | The system supports license types: DSP-5 (permanent export), DSP-73 (temporary export/import), DSP-85 (brokering), TAA (Technical Assistance Agreement), MLA (Manufacturing License Agreement), and BIS individual/validated end-user licenses |
| EXP-005-AC02 | Each license record tracks: license number, license type, issuing authority, approved parties (exporter, consignee, end-user), approved items (by USML/ECCN), authorized value, authorized quantity, provisos/conditions, effective date, and expiration date |
| EXP-005-AC03 | The system automatically draws down against the license's authorized value and/or quantity when a shipment is released; drawdown records link to the specific shipment |
| EXP-005-AC04 | The system prevents a shipment from being released if it would exceed the license's remaining authorized value or quantity |
| EXP-005-AC05 | Expiration alerts are sent at configurable intervals (default: 90, 60, 30, and 7 days before expiration) to the compliance officer and license administrator |
| EXP-005-AC06 | The system validates that a transaction's items, parties, and destination are within the scope of the license being applied (correct USML/ECCN, authorized consignee, approved country) |
| EXP-005-AC07 | Proviso compliance is tracked as a checklist of conditions per license; the compliance officer must confirm proviso compliance before a license can be used for drawdown |

### EXP-006: Screening List Auto-Update

| ID | Criterion |
|----|-----------|
| EXP-006-AC01 | The system automatically downloads updated screening lists from official government sources (OFAC SDN CSV, BIS Entity/Denied/Unverified List, and configured allied-nation lists) on a configurable schedule (default: daily at 02:00 UTC) |
| EXP-006-AC02 | List updates are processed transactionally: the new list fully replaces the old list only if parsing and validation succeed; on failure the previous list remains active and an alert is sent to the compliance administrator |
| EXP-006-AC03 | On successful list update, the system automatically re-screens all open transactions (sales orders not yet shipped, approved POs not yet received, pending shipments) against the updated lists |
| EXP-006-AC04 | New matches discovered during re-screening trigger automatic transaction holds per EXP-003 |
| EXP-006-AC05 | List update history is maintained: date of update, source URL, number of entries, number of additions/removals vs. prior version, and hash of the ingested file |
| EXP-006-AC06 | Manual list upload is supported for scenarios where the system lacks internet access (Constraint C5: air-gapped environments) |

### EXP-007: End-Use Certificate Management

| ID | Criterion |
|----|-----------|
| EXP-007-AC01 | The system provides configurable end-use certificate templates with fields: item description, quantity, value, end-use statement, consignee name and address, country of ultimate destination, non-transfer/non-re-export clause, and signature blocks |
| EXP-007-AC02 | End-use certificates are linked to one or more sales orders and/or shipments |
| EXP-007-AC03 | Certificate lifecycle statuses are tracked: draft, issued, sent to customer, signed and received, archived, expired |
| EXP-007-AC04 | Signed certificates can be uploaded as scanned documents (PDF, TIFF, JPEG) and are stored in the document management system with a link to the certificate record |
| EXP-007-AC05 | The system alerts when a shipment is ready to release but its associated end-use certificate is not in `signed and received` status |

### EXP-008: Immutable Compliance Audit Trail

| ID | Criterion |
|----|-----------|
| EXP-008-AC01 | Every compliance-relevant event is recorded in an append-only audit log: screening execution and results, classification changes, hold application and release, license drawdowns, country restriction changes, compliance officer overrides, and end-use certificate status changes |
| EXP-008-AC02 | Audit log entries include: event type, timestamp, actor (user ID and role), target entity (transaction ID, item ID, party ID), before/after state for changes, and a structured detail payload |
| EXP-008-AC03 | The audit log is append-only at the application level: no API endpoint, admin tool, or database operation can modify or delete audit entries |
| EXP-008-AC04 | Audit log entries are retained for a minimum of 5 years (Constraint C3); retention period is configurable to meet stricter requirements |
| EXP-008-AC05 | The audit log supports query and export: filter by date range, event type, actor, and target entity; export to CSV and PDF for regulatory examination |
| EXP-008-AC06 | Audit log integrity is verifiable via hash chaining: each entry includes a hash of the previous entry, enabling tamper detection |

### EXP-009: Deemed Export Control

| ID | Criterion |
|----|-----------|
| EXP-009-AC01 | The system maintains a registry of foreign persons (non-US-citizen, non-permanent-resident employees and contractors) with their nationality, visa/immigration status, and clearance level |
| EXP-009-AC02 | Technology Control Plans (TCPs) define which ITAR/EAR-controlled technology a foreign person may access, under what license or exemption, and with what physical/logical access controls |
| EXP-009-AC03 | When a foreign person is assigned to a project or program involving classified items, the system checks whether a deemed export license or exemption covers the access and alerts compliance if not |
| EXP-009-AC04 | TCP status is tracked: draft, approved, active, expired, revoked |
| EXP-009-AC05 | Access grants and revocations are logged in the compliance audit trail |

### EXP-010: Compliance Reporting

| ID | Criterion |
|----|-----------|
| EXP-010-AC01 | The system generates ITAR annual compliance reports containing: all DDTC-licensed exports, license utilization summaries, compliance incidents, and training records |
| EXP-010-AC02 | The system generates BIS semi-annual reports for BIS-licensed transactions with utilization data |
| EXP-010-AC03 | The system supports voluntary self-disclosure preparation with: a chronological timeline of the relevant transactions, all screening results, all compliance officer decisions, and all audit trail entries for the period in question |
| EXP-010-AC04 | Reports can be exported to PDF and Excel formats |
| EXP-010-AC05 | Report generation does not require engineering support; the compliance officer can configure and run reports through the UI |

### EXP-011: Sanctions Scenario Modeling

| ID | Criterion |
|----|-----------|
| EXP-011-AC01 | The system provides a "what-if" analysis tool that evaluates a proposed transaction (party, item, destination, end-use) against the current sanctions and restriction landscape without creating a real transaction |
| EXP-011-AC02 | The scenario analysis returns: applicable classification, screening results, country restriction results, license requirements, and an overall go/no-go assessment |
| EXP-011-AC03 | Scenario analyses are logged in the audit trail for compliance documentation purposes |
| EXP-011-AC04 | The tool supports batch scenario analysis (e.g., evaluating a list of potential customers against current restrictions) |

---

## Domain Model

### Core Entities

```
ProductClassification
  - id: UUID
  - itemId: UUID (FK -> Product/InventoryItem)
  - jurisdiction: enum [ITAR, EAR, NOT_CONTROLLED]
  - usmlCategory: string | null          // e.g., "XV(a)"
  - eccn: string | null                  // e.g., "9A515.a.1"
  - classificationBasis: enum [SELF, CJ_DETERMINATION, DDTC_OPINION, BIS_OPINION]
  - referenceNumber: string | null       // CJ case number, opinion number
  - notes: text
  - version: integer
  - classifiedBy: UUID (FK -> User)
  - classifiedAt: timestamp
  - supersededBy: UUID | null (FK -> ProductClassification)

ScreeningList
  - id: UUID
  - listName: string                     // e.g., "OFAC_SDN", "BIS_ENTITY_LIST"
  - sourceAuthority: string              // e.g., "US Treasury OFAC"
  - sourceUrl: string
  - lastUpdated: timestamp
  - entryCount: integer
  - fileHash: string
  - status: enum [ACTIVE, SUPERSEDED, FAILED_IMPORT]

ScreeningResult
  - id: UUID
  - transactionType: enum [SALES_ORDER, PURCHASE_ORDER, SHIPMENT]
  - transactionId: UUID
  - partyType: enum [CUSTOMER, VENDOR, END_USER, CONSIGNEE, INTERMEDIARY, FREIGHT_FORWARDER]
  - partyId: UUID
  - partyNameScreened: string            // name at time of screening (denormalized)
  - screenedAt: timestamp
  - overallResult: enum [CLEAR, MATCH, POSSIBLE_MATCH]
  - listsChecked: string[]               // list of ScreeningList IDs checked
  - matches: DeniedPartyMatch[]

DeniedPartyMatch
  - id: UUID
  - screeningResultId: UUID (FK -> ScreeningResult)
  - listName: string
  - listEntryId: string                  // identifier within the source list
  - matchedName: string
  - matchScore: float                    // 0.0-1.0 confidence
  - matchType: enum [EXACT, FUZZY, ALIAS, PHONETIC]
  - listEntryDetails: jsonb              // full entry from the list for context

ExportLicense
  - id: UUID
  - licenseNumber: string
  - licenseType: enum [DSP_5, DSP_73, DSP_85, TAA, MLA, BIS_INDIVIDUAL, BIS_VEU]
  - issuingAuthority: enum [DDTC, BIS]
  - status: enum [APPLIED, ISSUED, ACTIVE, EXPIRED, REVOKED, RETURNED]
  - effectiveDate: date
  - expirationDate: date
  - authorizedValue: decimal | null
  - authorizedQuantity: integer | null
  - remainingValue: decimal | null
  - remainingQuantity: integer | null
  - approvedItems: jsonb                 // [{itemId, usmlCategory/eccn, description}]
  - approvedParties: jsonb               // [{role, name, address, country}]
  - approvedCountries: string[]          // ISO 3166-1 codes
  - provisos: jsonb                      // [{provisoNumber, text, complianceConfirmed}]
  - notes: text

LicenseDrawdown
  - id: UUID
  - licenseId: UUID (FK -> ExportLicense)
  - shipmentId: UUID (FK -> Shipment)
  - drawdownValue: decimal | null
  - drawdownQuantity: integer | null
  - drawdownDate: timestamp
  - recordedBy: UUID (FK -> User)

EndUseCertificate
  - id: UUID
  - certificateNumber: string
  - templateId: UUID
  - status: enum [DRAFT, ISSUED, SENT, SIGNED_RECEIVED, ARCHIVED, EXPIRED]
  - salesOrderIds: UUID[]
  - shipmentIds: UUID[]
  - consigneeName: string
  - consigneeAddress: text
  - countryOfDestination: string         // ISO 3166-1
  - endUseStatement: text
  - nonTransferClause: text
  - issuedDate: date | null
  - signedDate: date | null
  - expirationDate: date | null
  - documentAttachmentId: UUID | null    // FK -> Document store

ComplianceHold
  - id: UUID
  - transactionType: enum [SALES_ORDER, PURCHASE_ORDER, SHIPMENT]
  - transactionId: UUID
  - holdReason: enum [SCREENING_MATCH, MISSING_LICENSE, COUNTRY_RESTRICTION, AMBIGUOUS_REGION, MISSING_CLASSIFICATION, MISSING_END_USE_CERT]
  - triggeringEntityId: UUID | null      // FK -> ScreeningResult, CountryRestriction, etc.
  - status: enum [ACTIVE, RELEASED, REJECTED, ESCALATED]
  - createdAt: timestamp
  - resolvedAt: timestamp | null
  - resolvedBy: UUID | null (FK -> User)
  - disposition: enum | null [FALSE_POSITIVE, LICENSE_ON_FILE, LICENSE_EXCEPTION, REJECTED]
  - rationale: text | null
  - linkedLicenseId: UUID | null (FK -> ExportLicense)

CountryRestriction
  - id: UUID
  - countryCode: string                  // ISO 3166-1 alpha-2
  - regionCode: string | null            // sub-country region (e.g., "CRIMEA") — deprecated, use RegionRestriction for sub-national rules
  - restrictionLevel: enum [EMBARGOED, HEAVILY_RESTRICTED, LICENSE_REQUIRED, CAUTION, UNRESTRICTED]
  - sanctionsPrograms: string[]          // e.g., ["OFAC_IRAN", "EAR_RUSSIA_SECTORAL"]
  - effectiveDate: date
  - expirationDate: date | null
  - regulatoryReference: string          // e.g., "EO 13662, Directive 4"
  - version: integer
  - changedBy: UUID (FK -> User)
  - changeReason: text

RegionRestriction
  - id: UUID
  - countryCode: string                  // ISO 3166-1 alpha-2 (parent country)
  - regionIdentifier: string             // e.g., "UA-43" (Crimea), "UA-14" (Donetsk)
  - regionName: string                   // e.g., "Crimea", "Donetsk", "Luhansk"
  - boundaryType: enum [ADMIN_DIVISION, GEOJSON_POLYGON]
  - adminDivisions: string[] | null      // list of administrative division names/codes
  - geojsonBoundary: jsonb | null        // GeoJSON polygon for coordinate-based matching
  - restrictionLevel: enum [EMBARGOED, HEAVILY_RESTRICTED, LICENSE_REQUIRED, CAUTION, UNRESTRICTED]
  - sanctionsPrograms: string[]          // e.g., ["OFAC_CRIMEA"]
  - effectiveDate: date
  - expirationDate: date | null
  - regulatoryReference: string          // e.g., "EO 13685"
  - version: integer
  - changedBy: UUID (FK -> User)
  - changeReason: text

TechnologyControlPlan
  - id: UUID
  - foreignPersonId: UUID (FK -> ForeignPerson)
  - programId: UUID | null (FK -> Program)
  - status: enum [DRAFT, APPROVED, ACTIVE, EXPIRED, REVOKED]
  - authorizedTechnology: jsonb          // [{classificationId, description, accessScope}]
  - licenseOrExemption: string           // license number or exemption citation
  - physicalControls: text               // description of physical access controls
  - logicalControls: text                // description of IT access controls
  - approvedBy: UUID (FK -> User)
  - approvedAt: timestamp | null
  - effectiveDate: date | null
  - expirationDate: date | null

ForeignPerson
  - id: UUID
  - employeeId: UUID | null (FK -> Employee)
  - contractorId: UUID | null
  - nationality: string[]               // ISO 3166-1 alpha-2 codes
  - immigrationStatus: string            // e.g., "H-1B", "L-1", "F-1 OPT"
  - clearanceLevel: string | null
  - activeTcpIds: UUID[]

ComplianceAuditEntry
  - id: UUID
  - eventType: enum [SCREENING_EXECUTED, CLASSIFICATION_CHANGED, HOLD_APPLIED, HOLD_RELEASED, HOLD_REJECTED, LICENSE_DRAWDOWN, COUNTRY_RESTRICTION_CHANGED, OVERRIDE_APPLIED, EUC_STATUS_CHANGED, TCP_CHANGED, SCENARIO_ANALYZED]
  - timestamp: timestamp
  - actorId: UUID (FK -> User)
  - actorRole: string
  - targetEntityType: string
  - targetEntityId: UUID
  - beforeState: jsonb | null
  - afterState: jsonb | null
  - detail: jsonb
  - previousEntryHash: string
  - entryHash: string
```

### Entity Relationships

```
Product/InventoryItem  1---1  ProductClassification (versioned)
ScreeningResult        *---1  Transaction (SO/PO/Shipment)
ScreeningResult        1---*  DeniedPartyMatch
ExportLicense          1---*  LicenseDrawdown
LicenseDrawdown        *---1  Shipment
ComplianceHold         *---1  Transaction (SO/PO/Shipment)
ComplianceHold         *---0..1  ExportLicense
EndUseCertificate      *---*  SalesOrder
EndUseCertificate      *---*  Shipment
TechnologyControlPlan  *---1  ForeignPerson
TechnologyControlPlan  *---0..1  Program
CountryRestriction     *---1  Country (by code)
RegionRestriction      *---1  Country (by code, parent country)
ComplianceHold         *---0..1  RegionRestriction (for AMBIGUOUS_REGION holds)
```

---

## Key Workflows

### Sales Order Compliance Check

```
Order Entry
  |
  v
[1] Classification Check ──── Item unclassified? ──> BLOCK (cannot save order)
  |
  v
[2] Country Restriction Check ── Embargoed? ──> BLOCK (requires OFAC license #)
  |                              License req? ──> HOLD
  |
  v
[3] Denied-Party Screen ──── Match found? ──> HOLD
  |  (all parties)            Possible match? ──> HOLD (compliance queue)
  |
  v
[4] License Requirement Check ── ITAR/EAR item to non-exempt destination? ──> HOLD (license required)
  |                              License on file + within limits? ──> PASS
  |
  v
[5] All checks PASS
  |
  v
Order Confirmed (eligible for fulfillment)
```

### Export License Application and Tracking

```
Compliance Officer identifies license need
  |
  v
Create License record (status: APPLIED)
  |── Populate: items, parties, countries, requested value/quantity
  |── Attach supporting documents (technical specs, end-use certs)
  |
  v
Submit to DDTC/BIS (manual, external to SatERP)
  |
  v
License received ──> Update status to ISSUED/ACTIVE
  |── Enter: license number, authorized limits, provisos, dates
  |
  v
License active ──> Available for drawdown on qualifying transactions
  |── System validates scope match on each drawdown attempt
  |── Drawdown reduces remaining value/quantity
  |
  v
Approaching expiration or limit ──> Alerts sent per schedule
  |
  v
License expired/exhausted ──> Status updated; no further drawdowns permitted
```

### Screening List Update Ingestion

```
Scheduled trigger (daily 02:00 UTC) or manual upload
  |
  v
Download list from source URL (or accept manual upload file)
  |
  v
Parse and validate
  |── Parse failure? ──> Retain previous list; alert compliance admin
  |── Validate entry count within expected range (detect truncation)
  |
  v
Atomic replacement: new list replaces old within a transaction
  |── Record: source, timestamp, entry count, delta, file hash
  |
  v
Re-screen all open transactions against updated lists
  |── New matches? ──> Apply holds per EXP-003
  |── Previously matched entries removed from list? ──> (no auto-release; compliance officer must review)
  |
  v
Log update completion in compliance audit trail
```

### Compliance Officer Override

```
Compliance officer opens hold from Compliance Hold Queue
  |
  v
Reviews context:
  |── Screening results (match details, scores, list entry context)
  |── Item classification and license requirements
  |── Destination country restriction level
  |── End-use information
  |── Historical transactions with same parties
  |
  v
Decision:
  |── RELEASE (false positive) ──> Provide rationale; transaction resumes
  |── RELEASE (license on file) ──> Link license record; verify drawdown capacity; transaction resumes
  |── RELEASE (license exception) ──> Cite exception; provide rationale; transaction resumes
  |── REJECT ──> Provide rationale; transaction cancelled; sales notified
  |
  v
Decision recorded in immutable audit trail:
  |── Compliance officer identity
  |── Timestamp
  |── Disposition and rationale
  |── Linked authorization (if applicable)
```

### End-Use Certificate Lifecycle

```
Sales order for defense article to foreign end-user
  |
  v
Compliance officer generates EUC from template
  |── Populates: item details, consignee, destination, end-use statement
  |── Status: DRAFT
  |
  v
Review and issue ──> Status: ISSUED
  |
  v
Send to customer for signature ──> Status: SENT
  |
  v
Customer returns signed certificate
  |── Upload scanned document
  |── Status: SIGNED_RECEIVED
  |
  v
Shipment release check:
  |── EUC in SIGNED_RECEIVED status? ──> Shipment may proceed
  |── EUC not signed? ──> Shipment held; alert compliance officer
  |
  v
Post-shipment: Status: ARCHIVED (retained per Constraint C3)
```

### Deemed Export Assessment for Foreign Person Access

```
Foreign person identified (new hire, contractor, reassignment)
  |
  v
HR/FSO enters foreign person record
  |── Nationality, immigration status, clearance level
  |
  v
Person assigned to program/project involving controlled items
  |
  v
System checks: does the program involve ITAR/EAR items?
  |── No controlled items ──> No action required
  |── Controlled items present:
      |
      v
      Check: existing TCP covers the access?
      |── Yes, TCP active and in scope ──> Access permitted; log in audit trail
      |── No TCP or TCP insufficient:
          |
          v
          Alert compliance officer
          |── Assess: does a license exemption apply? (e.g., fundamental research, Canadian exemption)
          |── Exemption applies ──> Create/update TCP citing exemption; access permitted
          |── No exemption ──> Deemed export license required
              |── Block access until license obtained
              |── Create license application record
```

---

## Integration Points

### Internal Module Integrations

| Module | Integration | Direction |
|--------|------------|-----------|
| **Sales (SLS)** | Sales order compliance check triggered on order create/update; compliance hold blocks order confirmation | EXP <-> SLS |
| **Procurement (SCM)** | Vendor and PO screening on PO create/update; ITAR/EAR classification per inventory item (SCM-009) propagated from EXP classifications | EXP <-> SCM |
| **Logistics (LOG)** | Shipment screening at release; country restriction enforcement; license drawdown on shipment; customs documentation pulls classification data | EXP <-> LOG |
| **Platform - Audit (PLT-003)** | Compliance audit entries flow to the platform audit log; compliance module may maintain its own hash-chained log in addition | EXP -> PLT |
| **Platform - RBAC (PLT-002)** | `compliance_officer`, `compliance_admin`, and `facility_security_officer` roles gate access to compliance features; ITAR compartment-level permissions restrict access to ITAR-classified item data | EXP <-> PLT |
| **Platform - Workflow (PLT-007)** | Compliance holds integrate with the workflow engine for escalation, notification, and approval routing | EXP <-> PLT |
| **Platform - Notifications (PLT-008)** | License expiration alerts, hold escalation notifications, screening list update results, and new hold notifications | EXP -> PLT |
| **Financial (FIN)** | No direct integration in Phase 1; future: license fee tracking and compliance cost allocation |
| **CRM (CRM)** | Customer screening on opportunity creation (Phase 2 enhancement); compliance status visible on account records | EXP <-> CRM |
| **Program Management (PGM)** | Deemed export checks triggered on program team assignment (Phase 3) | EXP <-> PGM |

### External Integrations

| External System | Integration Method | Data Flow | Phase |
|----------------|-------------------|-----------|-------|
| **OFAC SDN / Consolidated Lists** | HTTPS download from `sanctionslist.ofac.treas.gov` (CSV/XML) | Inbound: screening list data | Phase 1 (automated daily ingestion; manual upload fallback for air-gapped environments) |
| **BIS Entity/Denied/Unverified Lists** | HTTPS download from BIS website (CSV) | Inbound: screening list data | Phase 1 (automated daily ingestion; manual upload fallback for air-gapped environments) |
| **Allied-Nation Lists** (UK, EU, AU, CA) | HTTPS download from respective government sources | Inbound: screening list data | Phase 1 (automated daily ingestion) |
| **DDTC D-Trade** | Manual (no API available) | License applications and status | Manual workflow |
| **BIS SNAP-R** | Manual (no public API) | BIS license applications | Manual workflow |
| **AES / ACE (Census/CBP)** | Future integration for electronic export filing | Outbound: export declarations | Phase 3+ |

### API Endpoints (Phase 1)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/export-control/classifications` | GET, POST | List/create product classifications |
| `/api/export-control/classifications/{itemId}` | GET, PUT | Get/update classification for an item |
| `/api/export-control/screening/execute` | POST | Execute screening for a transaction |
| `/api/export-control/screening/results/{transactionId}` | GET | Get screening results for a transaction |
| `/api/export-control/holds` | GET | List compliance holds (filterable) |
| `/api/export-control/holds/{holdId}/release` | POST | Release a compliance hold |
| `/api/export-control/holds/{holdId}/reject` | POST | Reject a held transaction |
| `/api/export-control/countries` | GET, POST | List/create country restriction rules |
| `/api/export-control/countries/{code}` | GET, PUT | Get/update country restriction |
| `/api/export-control/licenses` | GET, POST | List/create export licenses |
| `/api/export-control/licenses/{id}/drawdown` | POST | Record a license drawdown |
| `/api/export-control/audit` | GET | Query compliance audit trail |

---

## Open Design Questions

1. **Fuzzy match threshold defaults.** What is the right default threshold for fuzzy screening matches? Too low generates excessive false positives that burden the compliance team; too high risks missing true matches. Need to benchmark against known test data from OFAC and BIS. Consider separate thresholds per list (SDN vs. Entity List may warrant different sensitivity).

2. **Offline / air-gapped screening list management.** Constraint C5 requires the system to function without external network access. For Phase 1, manual list upload is acceptable. For Phase 2, what is the UX for environments that have intermittent connectivity? Consider a "list update bundle" that can be downloaded on a connected machine and transferred via USB/sneakernet.

3. **Retroactive re-screening scope.** When a screening list is updated, re-screening all open transactions is clear. Should we also re-screen recently completed transactions (e.g., shipped in the last 30 days) to catch cases where the order shipped to a party that was added to a list after shipment? This matters for voluntary self-disclosure timing.

4. **Classification inheritance for assemblies.** If a satellite assembly contains ITAR-controlled components, does the assembly automatically inherit the most restrictive classification? ITAR "see-through" rules and de minimis calculations for EAR items need to be modeled. This may require a BOM-aware classification engine.

5. **Multi-jurisdiction compliance.** The PRD mentions EU dual-use regulations. How deeply should Phase 1 support non-US export control regimes? Recommendation: Phase 1 focuses on US (ITAR/EAR/OFAC); the data model accommodates non-US regimes (EU, UK, Australia) as additional screening lists and classification schemes, with full support in Phase 2-3.

6. **Screening engine build vs. buy.** Should SatERP build its own screening engine or integrate with a commercial screening service (e.g., Descartes Visual Compliance, Dow Jones Risk & Compliance)? Building ensures Constraint C5 compliance (no external dependencies) and avoids vendor lock-in, but commercial engines have decades of fuzzy-matching refinement. Recommendation: build a competent in-house engine for Phase 1 (offline-capable), with an adapter interface that allows plugging in a commercial engine for operators who prefer it.

7. **Compliance officer availability.** What happens if a hold is placed and no compliance officer is available to review it? The system needs an escalation path (compliance manager, then VP, then automatic notification to outside counsel). Define the escalation timing and fallback roles.

8. **Integration with legal hold / litigation hold.** If a voluntary self-disclosure is in progress, should the system support a "litigation hold" that prevents deletion or modification of any related records? This may overlap with Platform audit log capabilities but warrants explicit consideration.

9. **Sub-country region data source.** For EXP-004-AC06 (Crimea/Donetsk/Luhansk region restrictions), what is the authoritative data source for mapping addresses to restricted regions? Address parsing and geocoding in conflict zones is unreliable. Consider a conservative approach: any Ukraine address that cannot be definitively mapped to a non-restricted region triggers a compliance hold for manual review.

10. **Performance at scale.** EXP-002-AC09 requires screening a single party in under 2 seconds against 500K list entries. This is achievable with pre-indexed data structures (e.g., trigram index for fuzzy matching). Need to validate this performance target with realistic data volumes and confirm that batch re-screening (EXP-006 triggering re-screen of all open transactions) completes within an acceptable window.

---

*This feature specification is governed by the [PRD](../prd.md). All design and implementation decisions must trace back to requirements EXP-001 through EXP-012 defined therein.*
