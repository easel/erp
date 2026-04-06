---
title: Procurement
weight: 3
---

## Vendor

Supplier of goods or services.

**Schema**: `CreateVendorSchema` in [`vendor.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/vendor.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | UUID | Yes | Legal entity |
| `vendorCode` | string | Yes | Unique vendor code |
| `legalName` | string | Yes | Legal entity name |
| `tradeName` | string | No | Trade / DBA name |
| `countryCode` | string | Yes | ISO 3166-1 alpha-2 |
| `defaultCurrencyCode` | string | Yes | Default payment currency |
| `taxId` | string | No | Tax identification number |
| `paymentTerms` | string | No | Payment terms |
| `riskRating` | enum | No | LOW, MEDIUM, HIGH |
| `website` | URL | No | Vendor website |
| `notes` | string | No | Internal notes |

### Vendor Contacts & Addresses

Each vendor can have multiple contacts (`CreateVendorContactSchema`) and addresses (`CreateVendorAddressSchema`).

---

## Purchase Order

Order placed with a vendor. Follows a lifecycle: DRAFT → SUBMITTED → APPROVED → SENT → RECEIVED → CLOSED.

**Schema**: `CreatePurchaseOrderSchema` in [`purchase-order.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/purchase-order.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | UUID | Yes | Legal entity |
| `vendorId` | UUID | Yes | Supplier |
| `poNumber` | string | Yes | Unique PO number |
| `orderDate` | date string | Yes | Order date |
| `currencyCode` | string | Yes | PO currency |
| `lines` | PurchaseOrderLine[] | Yes | At least one line |

### Purchase Order Line

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `productId` | UUID | No | Product reference |
| `description` | string | Yes | Line description |
| `quantity` | number | Yes | Order quantity |
| `unitOfMeasure` | string | Yes | Unit (EA, KG, etc.) |
| `unitPrice` | string | Yes | Price per unit |

---

## Goods Receipt

Records physical receipt of goods against a purchase order.

**Schema**: `CreateGoodsReceiptSchema` in [`goods-receipt.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/goods-receipt.ts)

---

## Vendor Bill & Payment

Invoice received from vendor. Supports approval workflow, payment batches, and void.

**Schema**: `CreateVendorBillSchema` in [`vendor-bill.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/vendor-bill.ts)
