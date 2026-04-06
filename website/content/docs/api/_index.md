---
title: API Reference
weight: 4
---

Apogee exposes a [GraphQL](https://graphql.org/) API built with [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) and [Pothos](https://pothos-graphql.dev/) (code-first schema builder).

## Endpoint

```
POST /graphql
Content-Type: application/json
```

GraphiQL explorer is available at `GET /graphql` in development mode.

## Queries

All list queries require an `entityId` argument scoping results to a legal entity.

| Query | Returns | Description |
|-------|---------|-------------|
| `vendors(entityId)` | `[Vendor]` | All vendors for entity |
| `customers(entityId)` | `[Customer]` | All customers |
| `products(entityId)` | `[Product]` | All products |
| `accounts(entityId)` | `[Account]` | Chart of accounts |
| `journalEntries(entityId)` | `[JournalEntry]` | Journal entries with lines |
| `salesOrders(entityId)` | `[SalesOrder]` | Sales orders with compliance status |
| `salesOrder(id)` | `SalesOrder` | Single order by ID |
| `purchaseOrders(entityId)` | `[PurchaseOrder]` | Purchase orders |
| `opportunities(entityId)` | `[Opportunity]` | CRM opportunities |
| `complianceHolds(entityId)` | `[ComplianceHold]` | Active compliance holds |
| `crmCompanies(entityId)` | `[CrmCompany]` | CRM companies |
| `crmContacts(entityId)` | `[CrmContact]` | CRM contacts |
| `pipelineStages(entityId)` | `[PipelineStage]` | Pipeline stages |
| `fiscalYears(entityId)` | `[FiscalYear]` | Fiscal years |
| `fiscalPeriods(entityId)` | `[FiscalPeriod]` | Fiscal periods |
| `inventoryLocations(entityId)` | `[InventoryLocation]` | Warehouse locations |
| `screeningLists` | `[ScreeningList]` | All screening lists |
| `countryRestrictions` | `[CountryRestriction]` | Country export rules |
| `restrictedRegions` | `[RestrictedRegion]` | Sanctioned regions |
| `currencies` | `[Currency]` | All currencies |

## Mutations

| Mutation | Input | Description |
|----------|-------|-------------|
| `createVendor(input)` | `CreateVendorInput` | Create a new vendor |
| `createJournalEntry(input)` | `CreateJournalEntryInput` | Create a journal entry with balanced lines |

## Example Query

```graphql
query GetVendors {
  vendors(entityId: "a0000000-0000-0000-0000-000000000001") {
    id
    vendorCode
    legalName
    countryCode
    defaultCurrencyCode
    riskRating
  }
}
```

## Example Mutation

```graphql
mutation CreateVendor($input: CreateVendorInput!) {
  createVendor(input: $input) {
    id
    name
  }
}
```

Variables:
```json
{
  "input": {
    "entityId": "a0000000-0000-0000-0000-000000000001",
    "vendorCode": "VEND-NEW",
    "legalName": "New Vendor LLC",
    "countryCode": "US",
    "defaultCurrencyCode": "USD"
  }
}
```
