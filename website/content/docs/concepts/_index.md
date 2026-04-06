---
title: Core Concepts
weight: 2
---

Apogee is a modular ERP system designed for satellite and space-technology companies. This section covers the architectural decisions and domain model.

## Modules

Apogee is organized into six functional modules:

| Module | Purpose | Key Entities |
|--------|---------|-------------|
| **Finance** | General ledger, chart of accounts, fiscal periods | Account, JournalEntry, FiscalPeriod, Currency |
| **Sales** | Order-to-cash lifecycle | Customer, SalesOrder, Quote, CustomerInvoice |
| **Procurement** | Procure-to-pay lifecycle | Vendor, PurchaseOrder, GoodsReceipt, VendorBill |
| **Inventory** | Stock tracking and traceability | InventoryItem, Lot, SerialNumber, Location |
| **CRM** | Customer relationship management | CrmCompany, CrmContact, Opportunity, Lead |
| **Compliance** | Export control and sanctions screening | ComplianceHold, ScreeningList, CountryRestriction |

## Architecture

- **API**: GraphQL (Yoga + Pothos code-first schema) over PostgreSQL
- **Frontend**: Next.js 15 App Router with server components
- **Validation**: Zod schemas in `@apogee/shared` as the single source of truth (ADR-010)
- **UI Components**: shadcn/ui + Radix Primitives + Tailwind CSS 4 (ADR-011)
- **Database**: PostgreSQL with Graphile Migrate for schema management

## Multi-Entity Support

Apogee supports multiple legal entities within a single deployment. Every transactional entity (vendors, customers, orders, journal entries) is scoped to a `legalEntityId` / `entityId`. This enables consolidated reporting across subsidiaries while maintaining proper legal separation.

## Compliance Model

Export compliance is embedded in the data model, not bolted on:

- **Screening lists** (OFAC SDN, BIS Entity List, etc.) are ingested as structured data
- **Denied-party screening** runs against sales orders and produces match results
- **Compliance holds** block order fulfillment until reviewed and released
- **Country restrictions** define per-country rules (embargo, license required, etc.)
- **Restricted regions** flag geographic areas with sanctions exposure
