# FEAT-005: Orbital Asset Management

**Authority Level:** 3 (Governing)
**Status:** Draft
**Created:** 2026-04-04
**Governed by:** [PRD](../prd.md)

---

## Overview

Orbital Asset Management is the most satellite-specific module in SatERP. It provides first-class entities for satellites, transponders, beams, spectrum licenses, and ground stations, serving as the authoritative registry for all physical and regulatory assets in the operator's fleet.

The module links orbital assets to financial records (depreciation, impairment), customer contracts (capacity leases, managed bandwidth), and program management (build and launch programs). It supports both GEO satellites -- where transponders are leased to customers on multi-year contracts -- and LEO constellations -- where managed bandwidth is delivered to terminal users across dynamically scheduled ground station passes.

Ground stations span multiple countries with heterogeneous antenna assets. Spectrum licenses involve ITU coordination filings and national regulatory bodies, each with independent renewal cycles and compliance obligations.

---

## User Stories

### Satellite Registry

- **US-OAM-010:** As an operations engineer, I want to register a new satellite with its bus type, payload manifest, launch vehicle, and target orbital slot so that all downstream systems reference a single source of truth.
- **US-OAM-011:** As an operations engineer, I want to update a satellite's Two-Line Element (TLE) set and propagated ephemeris so that other modules have current orbital parameters.
- **US-OAM-012:** As an operations engineer, I want to transition a satellite through lifecycle states (design, manufacturing, launch, commissioning, operational, end-of-life, deorbit) with enforced state-machine rules so that status changes are auditable and consistent.
- **US-OAM-013:** As a fleet manager, I want to view the full satellite fleet on a dashboard showing lifecycle status, orbital position, and health summary so that I can assess fleet readiness at a glance.

### Transponder / Beam Management

- **US-OAM-020:** As a capacity planner, I want to define the transponder inventory for each satellite, including center frequency, bandwidth, polarization, and EIRP so that capacity can be precisely allocated.
- **US-OAM-021:** As a capacity planner, I want to define spot beams and wide beams per satellite with coverage footprint polygons so that sales teams can match customer coverage requirements to available capacity.
- **US-OAM-022:** As a capacity planner, I want to see real-time allocation status (available, partially allocated, fully allocated, reserved, failed) for each transponder and beam so that I avoid over-commitment.

### Capacity Allocation

- **US-OAM-030:** As a sales operations analyst, I want to allocate a portion of a transponder or beam to a customer contract, specifying bandwidth, power, and coverage, so that utilization is tracked against commitments.
- **US-OAM-031:** As a sales operations analyst, I want to view utilization reports by satellite, transponder, beam, and customer so that I can identify underutilized and overcommitted resources.
- **US-OAM-032:** As a revenue analyst, I want capacity allocations linked to billing line items so that revenue recognition reflects actual capacity delivered.

### Ground Stations

- **US-OAM-040:** As a ground segment engineer, I want to register ground stations with geographic coordinates, antenna inventory, supported frequency bands, and operational status so that scheduling and maintenance are centrally managed.
- **US-OAM-041:** As a maintenance planner, I want to define and track maintenance schedules for each ground station and antenna, including preventive and corrective maintenance windows, so that availability is predictable.
- **US-OAM-042:** As a ground segment engineer, I want to record ground station availability (operational, degraded, offline, maintenance) with timestamped status changes so that scheduling systems account for real conditions.

### Spectrum Management

- **US-OAM-050:** As a regulatory affairs manager, I want to maintain a registry of all spectrum licenses including ITU filing references, national license numbers, assigned frequency bands, orbital slots, and jurisdictions so that compliance status is always visible.
- **US-OAM-051:** As a regulatory affairs manager, I want automated alerts when spectrum licenses approach expiration (configurable lead times) so that renewals are never missed.
- **US-OAM-052:** As a regulatory affairs manager, I want to track the status of ITU coordination procedures (API/CR filings, due diligence findings, coordination requests, bilateral agreements) so that filing deadlines and obligations are met.
- **US-OAM-053:** As a finance manager, I want spectrum lease costs linked to the corresponding financial records so that license amortization and lease payments are correctly tracked.

### Kratos Integration

- **US-OAM-060:** As an operations engineer, I want SatERP to ingest telemetry summaries from Kratos quantumCMD so that satellite health data is available alongside asset records without duplicating the TT&C system.
- **US-OAM-061:** As an operations engineer, I want SatERP to pull pass schedule data from Kratos epoch IPS so that LEO ground station scheduling reflects the authoritative pass plan.

---

## Acceptance Criteria

### OAM-001: Satellite Registry

*Traces to: PRD OAM-001*

| # | Criterion |
|---|-----------|
| AC-001.1 | A satellite record can be created with required fields: name, NORAD ID (optional pre-launch), bus type, operator, orbital regime (GEO/MEO/LEO/HEO), target orbital slot or constellation ID, and planned launch date. |
| AC-001.2 | NORAD ID format: 5-digit integer (per USSPACECOM convention). Duplicate NORAD IDs are rejected. Required fields for operational satellites: name, operator entity, orbit type (GEO/LEO/MEO/HEO), status. Pre-launch satellites require: name, operator entity, target orbit type, build program reference. |
| AC-001.3 | TLE data can be imported (manual paste or API fetch from Space-Track) and stored with a timestamp; the system retains TLE history. |
| AC-001.4 | Lifecycle state transitions follow the defined state machine; invalid transitions are rejected with an error message identifying the current state and permitted transitions. |
| AC-001.5 | Payload metadata (number of transponders, beam count, antenna types, power budget) is stored and editable. |
| AC-001.6 | All changes to satellite records produce an immutable audit log entry with user, timestamp, and before/after values. |

### OAM-002: Transponder and Beam Inventory

*Traces to: PRD OAM-002*

| # | Criterion |
|---|-----------|
| AC-002.1 | Transponders are defined per satellite with: designator, center frequency (MHz), bandwidth (MHz), polarization (linear H/V or circular L/R), nominal EIRP (dBW), and allocation status. |
| AC-002.2 | Beams are defined per satellite with: beam ID, type (spot/wide/steerable), coverage footprint (GeoJSON polygon), gain contour references, and associated transponders. |
| AC-002.3 | Frequency band is classified per ITU nomenclature (C, Ku, Ka, L, S, X, Q/V) and stored alongside each transponder. |
| AC-002.4 | Allocation status is computed from linked capacity allocations; manual override is permitted with an audit reason. |

### OAM-003: Capacity Allocation Tracking

*Traces to: PRD OAM-003*

| # | Criterion |
|---|-----------|
| AC-003.1 | A capacity allocation links a transponder or beam segment to a customer contract line item, specifying allocated bandwidth (MHz), power (dBW or percentage), and coverage region. |
| AC-003.2 | The system prevents over-allocation: total allocated bandwidth on a transponder cannot exceed its rated bandwidth unless an override with justification is provided. Over-allocation override requires `capacity_planning_admin` role. Override justification is stored as free-text and audit-logged. Over-allocation by more than 20% requires additional approval from `capacity_director` role. |
| AC-003.3 | Utilization reports can be generated per satellite, per transponder, per beam, per customer, and per time period, showing allocated vs. available capacity. |
| AC-003.4 | Capacity allocations have start and end dates aligned with the governing contract term. |

### OAM-004: Ground Station Asset Records

*Traces to: PRD OAM-004*

| # | Criterion |
|---|-----------|
| AC-004.1 | Ground station records include: name, geographic coordinates (WGS-84), country, supported frequency bands, number and type of antennas, and operational status. |
| AC-004.2 | Each antenna within a ground station is individually tracked with: diameter, mount type, supported bands, and current status. |
| AC-004.3 | Maintenance schedules (preventive and corrective) are stored with planned dates, actual dates, and completion status. |
| AC-004.4 | Ground station availability is reported as a percentage over configurable time windows. Availability = (total_time - unplanned_downtime) / total_time * 100. Scheduled maintenance does not count as downtime. Configurable time windows: last 24h, 7d, 30d, 90d, 365d, and custom range. |

### OAM-005: Spectrum License Registry

*Traces to: PRD OAM-005*

| # | Criterion |
|---|-----------|
| AC-005.1 | Spectrum license records include: license ID, issuing authority, jurisdiction, frequency range (start/end MHz), orbital slot or constellation, grant date, expiration date, and renewal status. |
| AC-005.2 | ITU filing records include: filing type (API, CR), filing date, due diligence deadline, coordination status, and linked bilateral agreements. |
| AC-005.3 | Configurable alerts fire at 180, 90, 60, and 30 days before license expiration (thresholds are operator-configurable). |
| AC-005.4 | Licenses link to the satellites and frequency bands they authorize. |

### OAM-006: Satellite Depreciation and Impairment

*Traces to: PRD OAM-006*

| # | Criterion |
|---|-----------|
| AC-006.1 | Each satellite's depreciable life is derived from its design orbital life (years), and the depreciation schedule is generated in the Financial Management module using the operator's chosen method (straight-line default). |
| AC-006.2 | An impairment trigger event (anomaly reducing capacity, shortened orbital life, partial payload failure) can be recorded against a satellite, generating a financial impairment assessment workflow. |
| AC-006.3 | Revised depreciation schedules are automatically proposed when orbital life estimates change. |

### OAM-007: Ground Station Scheduling

*Traces to: PRD OAM-007*

| # | Criterion |
|---|-----------|
| AC-007.1 | Antenna time can be allocated to satellite contacts in defined time slots with conflict detection. |
| AC-007.2 | LEO pass scheduling assigns antenna time to satellite passes based on priority (configurable per satellite/mission). Conflicts are resolved by priority rank; equal-priority conflicts are flagged for manual resolution. A valid schedule has no overlapping antenna assignments and no unassigned mandatory passes. |
| AC-007.3 | Scheduling respects maintenance windows: antennas in maintenance are excluded from allocation. |

### OAM-008: Spectrum Lease Management

*Traces to: PRD OAM-008*

| # | Criterion |
|---|-----------|
| AC-008.1 | Spectrum leases (where the operator leases spectrum from a third party) are tracked with lease terms, payment schedules, and associated satellites. |
| AC-008.2 | Lease costs flow to the Financial Management module as operating expenses with correct period allocation. |
| AC-008.3 | Lease renewal dates trigger alerts using the same configurable threshold mechanism as owned licenses (OAM-005). |

### OAM-009: Kratos TT&C Integration

*Traces to: PRD OAM-009*

| # | Criterion |
|---|-----------|
| AC-009.1 | SatERP connects to Kratos quantumCMD via a configurable REST or message-queue interface to ingest telemetry summary data (satellite health status, anomaly flags). Kratos telemetry ingest expects JSON payloads containing: satellite_id, timestamp, health_status (NOMINAL/DEGRADED/ANOMALY), telemetry_summary (JSONB -- subsystem-level health). Poll frequency: configurable, default 5 minutes. |
| AC-009.2 | SatERP connects to Kratos epoch IPS to retrieve pass schedules and contact plans for LEO ground station scheduling. |
| AC-009.3 | Integration is implemented as an adapter with a defined interface so that alternative TT&C systems can be substituted without modifying core OAM logic. |
| AC-009.4 | Telemetry ingest failures are logged and surfaced as operational alerts; the system degrades gracefully (stale data is flagged, not silently served). Connection failure: retry with exponential backoff (1s, 2s, 4s, max 60s); after 10 consecutive failures, raise alert and continue operating with stale data. |

---

## Domain Model

```
┌─────────────┐       ┌──────────────┐       ┌────────────────┐
│  Satellite   │1────*│ Transponder  │1────*│CapacityAllocation│
│              │      │              │       │                │
│ noradId      │      │ designator   │       │ bandwidthMHz   │
│ name         │      │ centerFreqMHz│       │ powerDbW       │
│ busType      │      │ bandwidthMHz │       │ coverageRegion │
│ orbitalRegime│      │ polarization │       │ startDate      │
│ lifecycleState│     │ eirpDbW      │       │ endDate        │
│ launchDate   │      │ frequencyBand│       │ contractLineId │
│ orbitalLife  │      │ allocStatus  │       │ customerId     │
│ tleData[]    │      └──────────────┘       └────────────────┘
│ payloadMeta  │
└──────┬───────┘       ┌──────────────┐
       │1────*         │    Beam      │
       │               │             │
       │               │ beamId      │
       │               │ type        │  (spot/wide/steerable)
       │               │ footprint   │  (GeoJSON)
       │               │ gainContour │
       │               │ transponders│  (many-to-many)
       │               └──────────────┘
       │
       │              ┌───────────────┐
       └─────────────*│  OrbitalSlot  │
                      │               │
                      │ longitude     │  (GEO)
                      │ inclination   │  (LEO/MEO)
                      │ altitude      │
                      └───────────────┘

┌──────────────┐       ┌──────────────┐
│ GroundStation│1────*│   Antenna    │
│              │      │              │
│ name         │      │ diameter     │
│ coordinates  │      │ mountType    │
│ country      │      │ supportedBands│
│ status       │      │ status       │
│ supportedBands│     └──────┬───────┘
└──────────────┘             │1
                             │
                      ┌──────┴───────┐
                      │AntennaSchedule│
                      │              │
                      │ startTime    │
                      │ endTime      │
                      │ satelliteId  │
                      │ passId       │
                      │ scheduleType │ (contact/maintenance)
                      └──────────────┘

┌─────────────────┐     ┌──────────────┐
│ SpectrumLicense │*──1│  ITUFiling   │
│                 │    │              │
│ licenseId       │    │ filingType   │  (API/CR)
│ authority       │    │ filingDate   │
│ jurisdiction    │    │ dueDiligence │
│ freqRangeStart  │    │ coordStatus  │
│ freqRangeEnd    │    │ agreements[] │
│ orbitalSlotId   │    └──────────────┘
│ grantDate       │
│ expirationDate  │
│ renewalStatus   │
│ satellites[]    │
└─────────────────┘

┌─────────────────┐
│ FrequencyBand   │
│                 │
│ designation     │  (C/Ku/Ka/L/S/X/Q/V)
│ rangeLowMHz     │
│ rangeHighMHz    │
│ ituRegion       │
└─────────────────┘
```

### Key Relationships

- **Satellite** has many **Transponders** and **Beams**.
- **Transponder** belongs to a **FrequencyBand** and has many **CapacityAllocations**.
- **Beam** has a many-to-many relationship with **Transponders** (a beam may span multiple transponders; a transponder may serve multiple beams).
- **CapacityAllocation** references a contract line item in the Sales module and a customer ID.
- **Satellite** occupies an **OrbitalSlot** (GEO: longitude; LEO: orbital plane parameters).
- **GroundStation** has many **Antennas**, each with an **AntennaSchedule**.
- **SpectrumLicense** links to **Satellites**, **OrbitalSlots**, and **ITUFilings**.

---

## Key Workflows

### 1. Satellite Lifecycle

```
Design → Manufacturing → Launch → Commissioning → Operational → End-of-Life → Deorbit
         ↑                                          │
         └──── (return to manufacturing if          │
                launch failure / insurance)          │
                                                     ↓
                                              Graveyard (GEO)
```

- **Design:** Asset record created with planned parameters. Financial: capital commitment recorded.
- **Manufacturing:** Bus and payload build tracked via Program Management module. Progress milestones update the asset record.
- **Launch:** Launch date, vehicle, and outcome recorded. Insurance module notified.
- **Commissioning:** In-orbit testing. Transponder and beam inventory validated against actual performance. TLE ingested.
- **Operational:** Full commercial service. Capacity allocations active. Depreciation begins.
- **End-of-Life:** Capacity migration planned. Customers notified via contract management. Depreciation completes.
- **Deorbit / Graveyard:** Asset disposed. Residual book value written off. Spectrum licenses released or reassigned.

### 2. Capacity Allocation

1. Sales team identifies customer bandwidth requirement and coverage region.
2. Capacity planner searches available transponder/beam inventory matching frequency band, coverage, and power requirements.
3. Planner creates a **CapacityAllocation** linked to the draft contract line item.
4. Allocation is held in "reserved" status until the contract is executed.
5. On contract execution, allocation transitions to "active." Billing schedule is generated.
6. Utilization monitoring begins; periodic reports delivered to sales and finance.
7. On contract expiry or termination, allocation is released back to available inventory.

### 3. Spectrum License Renewal

1. System fires alert at configured lead time before license expiration.
2. Regulatory affairs manager reviews license terms and prepares renewal application.
3. Renewal application is filed with the national authority; status is tracked in the system.
4. If ITU coordination is required, the linked ITU filing record is updated.
5. On renewal grant, new expiration date is recorded. Financial module updates amortization schedule.
6. If renewal is denied, impacted satellites and capacity allocations are flagged for remediation.

### 4. Ground Station Maintenance Scheduling

1. Maintenance planner creates a preventive maintenance window for a specific antenna.
2. System checks for scheduling conflicts with existing satellite contacts.
3. If conflicts exist, planner is notified and can reschedule maintenance or reassign contacts to alternate antennas.
4. Maintenance window is confirmed; antenna status transitions to "maintenance."
5. On completion, maintenance record is closed with actual duration and findings. Antenna returns to "operational."

### 5. LEO Pass Scheduling

1. Pass windows are computed from TLE data or imported from Kratos epoch IPS.
2. System identifies required ground station contacts for each LEO satellite per orbit.
3. Antennas are assigned to passes based on availability, elevation angle, and priority.
4. Conflicts (overlapping passes, maintenance windows) are resolved by priority ranking or operator intervention.
5. Finalized schedule is published to ground station operations teams and optionally pushed back to Kratos.

### 6. Satellite Anomaly to Financial Impairment

1. Anomaly event is recorded against a satellite (from manual entry or Kratos telemetry alert).
2. Anomaly is classified: partial payload failure, reduced power, shortened orbital life, station-keeping anomaly.
3. If anomaly impacts capacity, affected **CapacityAllocations** are flagged. Customer notifications are triggered.
4. If anomaly impacts orbital life, a revised depreciation schedule is proposed to finance.
5. Finance reviews and records an impairment charge if the satellite's recoverable amount falls below book value.
6. Revised asset valuation flows through to financial statements.

---

## Integration Points

### Financial Management (FEAT-001)

| Direction | Data | Purpose |
|-----------|------|---------|
| OAM → FIN | Satellite cost basis, orbital life, lifecycle events | Depreciation schedule generation and impairment triggers |
| OAM → FIN | Spectrum lease terms, payment schedules | Operating expense recognition and amortization |
| FIN → OAM | Book value, accumulated depreciation | Display on satellite asset dashboard |

### Sales and Contract Management (FEAT-003)

| Direction | Data | Purpose |
|-----------|------|---------|
| OAM → SLS | Available capacity inventory (transponder/beam) | Contract quoting and capacity reservation |
| SLS → OAM | Executed contract line items | Activate capacity allocations, set start/end dates |
| OAM → SLS | Utilization data, anomaly impacts | Contract compliance reporting, SLA monitoring |

### Program Management (FEAT-008)

| Direction | Data | Purpose |
|-----------|------|---------|
| PGM → OAM | Satellite build milestones, launch schedule | Update satellite lifecycle state and planned dates |
| OAM → PGM | Commissioned satellite parameters | Close out build program, reconcile planned vs. actual |

### Kratos TT&C (External)

| Direction | Data | Purpose |
|-----------|------|---------|
| Kratos → OAM | Telemetry summaries, health status, anomaly flags | Satellite health monitoring, anomaly-to-impairment workflow |
| Kratos → OAM | Pass schedules, contact plans | LEO ground station antenna scheduling |
| OAM → Kratos | Ground station availability, maintenance windows | Scheduling constraint updates |

### Regulatory / Compliance

| Direction | Data | Purpose |
|-----------|------|---------|
| OAM → Reporting | Spectrum license status, ITU filing status | Regulatory compliance dashboards and audit trails |

---

## Non-Functional Requirements

- **Audit trail:** All mutations to satellite, transponder, beam, ground station, and spectrum license records must produce immutable audit log entries.
- **Multi-tenancy:** Operator may manage multiple subsidiary fleets; OAM data is partitioned by operating entity.
- **Performance:** Satellite fleet dashboard loads within 2 seconds for fleets up to 200 satellites. Capacity utilization reports generate within 5 seconds for queries spanning one year.
- **Data integrity:** Capacity over-allocation is prevented at the database constraint level, not only at the application level.
- **TLE freshness:** System flags TLE data older than a configurable threshold (default: 7 days for GEO, 2 days for LEO).

---

## Open Design Questions

1. **TLE ingestion source:** Should we integrate directly with Space-Track.org for automated TLE updates, or rely solely on Kratos as the TLE source? Direct integration provides independence from TT&C vendor but adds a dependency.

2. **Beam footprint storage:** GeoJSON polygons for beam footprints can be large (high-resolution contours). Should footprints be stored in the primary database or in an object store with references? What resolution is needed for capacity planning vs. customer-facing coverage maps?

3. **LEO constellation modeling:** For LEO constellations with hundreds of satellites, should the domain model support constellation-level capacity pools (aggregate bandwidth across the constellation) in addition to per-satellite allocations?

4. **Kratos integration protocol:** Kratos quantumCMD supports both REST APIs and message queues. Which integration pattern is preferred for telemetry ingest -- pull-based polling or push-based event streaming? What is the expected telemetry summary cadence?

5. **Multi-operator spectrum coordination:** When spectrum licenses are shared across orbital slots with coordination agreements, how should overlapping rights be modeled? Is a simple license-per-band-per-slot sufficient, or do we need a more complex interference graph?

6. **Historical capacity snapshots:** Should the system maintain point-in-time snapshots of capacity allocation state for historical reporting, or is deriving historical state from the allocation event log sufficient?

7. **GEO vs. LEO ground station scheduling:** GEO contacts are effectively continuous (always in view). Should the scheduling model treat GEO and LEO ground station contacts as fundamentally different entities, or can a unified model accommodate both with GEO contacts as long-duration passes?

8. **Insurance integration:** Satellite insurance is tightly coupled to orbital assets and anomalies. Should OAM own insurance policy records, or should this be a separate module that references OAM entities?
