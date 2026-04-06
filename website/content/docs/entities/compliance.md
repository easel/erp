---
title: Compliance
weight: 6
---

## Product Classification

ITAR/EAR export control classification for a product.

**Schema**: `CreateProductClassificationSchema` in [`export-control.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/export-control.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `productId` | UUID | Yes | Product being classified |
| `regime` | enum | Yes | ITAR, EAR, DUAL_USE |
| `classificationCode` | string | Yes | ECCN / USML category |
| `jurisdictionCountry` | string | Yes | Classifying jurisdiction |
| `licenseRequired` | boolean | Yes | Whether export license needed |
| `description` | string | No | Classification notes |

---

## Screening List

Denied-party or restricted-entity list (e.g., OFAC SDN, BIS Entity List).

**Schema**: `CreateScreeningListSchema` in [`export-control.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/export-control.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | List name |
| `source` | string | Yes | Issuing authority |
| `sourceUrl` | URL | No | Official list URL |
| `lastUpdated` | date string | No | Last data refresh |

### Screening List Entry

Individual entry on a screening list — person or organization.

**Schema**: `CreateScreeningListEntrySchema` in [`export-control.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/export-control.ts)

---

## Screening Result & Denied Party Match

Results from running denied-party screening against a sales order or customer. Matches link to specific screening list entries.

**Schema**: `CreateScreeningResultSchema`, `CreateDeniedPartyMatchSchema` in [`export-control.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/export-control.ts)

---

## Compliance Hold

Blocks order fulfillment pending compliance review. Created when screening finds a potential match or when a country restriction triggers.

**Schema**: `CreateComplianceHoldSchema` in [`export-control.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/export-control.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `salesOrderId` | UUID | Yes | Held order |
| `holdType` | enum | Yes | DENIED_PARTY_MATCH, EMBARGOED_COUNTRY, AMBIGUOUS_REGION, LICENSE_REQUIRED |
| `reason` | string | Yes | Human-readable reason |

### Resolving Holds

Holds are resolved via `ResolveComplianceHoldSchema` with a resolution (RELEASED, REJECTED, ESCALATED) and reviewer notes.

---

## Country Restriction

Per-country export control policy.

**Schema**: `CreateCountryRestrictionSchema` in [`export-control.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/export-control.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `countryCode` | string | Yes | ISO 3166-1 alpha-2 |
| `restrictionLevel` | enum | Yes | EMBARGO, LICENSE_REQUIRED, MONITORING, NONE |

### Country Restriction Rules

Detailed rules per restriction — `CreateCountryRestrictionRuleSchema` defines specific product categories, license types, or end-use conditions.

---

## Restricted Region

Geographic region under sanctions or export restrictions (e.g., Crimea, Donetsk).

**Schema**: `CreateRestrictedRegionSchema` in [`export-control.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/export-control.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Region name |
| `sanctionsRegime` | string | Yes | Governing sanctions program |
| `effectiveDate` | date string | Yes | When restriction took effect |
| `sourceAuthority` | string | Yes | Issuing authority |
| `countryCode` | string | Yes | Country containing the region |
| `parentCountryName` | string | No | Country display name |
