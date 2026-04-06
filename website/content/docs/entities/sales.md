---
title: Sales
weight: 2
---

## Customer

End customer purchasing satellite capacity, equipment, or services.

**Schema**: `CreateCustomerSchema` in [`sales.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/sales.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | UUID | Yes | Legal entity |
| `customerCode` | string | Yes | Unique customer code |
| `legalName` | string | Yes | Legal entity name |
| `tradeName` | string | No | DBA / trade name |
| `countryCode` | string | Yes | ISO 3166-1 alpha-2 |
| `defaultCurrencyCode` | string | Yes | Billing currency |
| `creditLimit` | string | No | Credit limit amount |
| `paymentTerms` | string | No | Payment terms (e.g., "NET30") |
| `taxId` | string | No | Tax identification number |
| `riskRating` | enum | No | LOW, MEDIUM, HIGH |

---

## Product

Sellable item — satellite capacity, equipment, or service.

**Schema**: `CreateProductSchema` in [`sales.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/sales.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | UUID | Yes | Legal entity |
| `productCode` | string | Yes | SKU / product code |
| `name` | string | Yes | Product name |
| `productType` | enum | Yes | GOODS, SERVICE, CAPACITY |
| `unitOfMeasure` | string | Yes | Unit (EA, MHz, HR, etc.) |
| `defaultPrice` | string | No | Default unit price |
| `currencyCode` | string | Yes | Price currency |
| `eccn` | string | No | Export control classification |
| `scheduleBCode` | string | No | HTS / Schedule B code |

---

## Sales Order

Customer order with compliance screening status. Orders with compliance holds cannot be fulfilled.

**Schema**: `CreateSalesOrderSchema` in [`sales.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/sales.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | UUID | Yes | Legal entity |
| `customerId` | UUID | Yes | Customer |
| `orderNumber` | string | Yes | Unique order number |
| `orderDate` | date string | Yes | Order date |
| `currencyCode` | string | Yes | Order currency |
| `complianceStatus` | enum | No | PENDING, CLEARED, HELD |
| `lines` | SalesOrderLine[] | Yes | At least one line item |

---

## Quote

Sales quote / proposal with line items. Can be converted to a sales order.

**Schema**: `CreateQuoteSchema` in [`quote.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/quote.ts)

---

## Customer Invoice & Payment

Invoice issued to customer for delivered goods/services. Supports line items, void, and payment recording.

**Schema**: `CreateCustomerInvoiceSchema` in [`customer-invoice.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/customer-invoice.ts)

---

## Return Authorization

Manages product returns with line-level quantities and reasons.

**Schema**: `CreateReturnAuthorizationSchema` in [`sales.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/sales.ts)
