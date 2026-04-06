---
title: Finance
weight: 1
---

## Account

Chart of accounts entry. Each account has a code, name, type (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE), and currency.

**Schema**: `CreateAccountSchema` in [`account.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/account.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | UUID | Yes | Legal entity |
| `accountCode` | string | Yes | Unique account code (e.g., "1100") |
| `name` | string | Yes | Display name |
| `accountType` | enum | Yes | ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE |
| `currencyCode` | string | Yes | ISO 4217 currency code |
| `parentAccountId` | UUID | No | Parent account for hierarchy |
| `isActive` | boolean | No | Whether account accepts postings |

### Account Segments & Mappings

Accounts support segment dimensions (department, cost center, project) via `AccountSegment`, `AccountSegmentValue`, and `AccountMapping` entities for multi-dimensional reporting.

---

## Journal Entry

Double-entry bookkeeping record with one or more debit/credit lines that must balance.

**Schema**: `CreateJournalEntrySchema` in [`journal-entry.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/journal-entry.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `legalEntityId` | UUID | Yes | Legal entity |
| `fiscalPeriodId` | UUID | Yes | Posting period |
| `entryDate` | date string | Yes | Transaction date |
| `reference` | string | No | External reference number |
| `description` | string | No | Entry description |
| `lines` | JournalLine[] | Yes | Min 2 lines, must balance |

### Journal Line

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountId` | UUID | Yes | Target account |
| `type` | enum | Yes | DEBIT or CREDIT |
| `amount` | string | Yes | Decimal amount |
| `currencyCode` | string | Yes | ISO 4217 code |
| `description` | string | No | Line description |

---

## Fiscal Period

Accounting period within a fiscal year. Controls which periods accept journal postings.

**Schema**: `CreateFiscalPeriodSchema` in [`fiscal-period.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/fiscal-period.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fiscalYearId` | UUID | Yes | Parent fiscal year |
| `name` | string | Yes | Period name (e.g., "January 2026") |
| `periodNumber` | number | Yes | Sequence within year (1-13) |
| `startDate` | date string | Yes | Period start |
| `endDate` | date string | Yes | Period end |
| `status` | enum | No | OPEN, CLOSED, ADJUSTING |

---

## Currency & Exchange Rates

ISO 4217 currencies and exchange rate management with support for multiple rate types (spot, budget, historical).

**Schema**: `CreateCurrencySchema`, `CreateExchangeRateSchema` in [`currency.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/currency.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | ISO 4217 code (e.g., "USD") |
| `name` | string | Yes | Currency name |
| `symbol` | string | Yes | Display symbol (e.g., "$") |
| `decimalPlaces` | number | Yes | Precision (typically 2) |
