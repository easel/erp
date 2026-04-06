---
title: Inventory
weight: 4
---

## Inventory Item

Trackable item in the warehouse — can be serialized, lot-tracked, or neither.

**Schema**: `CreateInventoryItemSchema` in [`inventory.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/inventory.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | UUID | Yes | Legal entity |
| `productId` | UUID | Yes | Product reference |
| `locationId` | UUID | Yes | Warehouse location |
| `trackingMethod` | enum | Yes | NONE, LOT, SERIAL |
| `quantityOnHand` | number | Yes | Current stock level |
| `unitOfMeasure` | string | Yes | Stock unit |
| `reorderPoint` | number | No | Minimum stock trigger |
| `reorderQuantity` | number | No | Standard reorder amount |

---

## Inventory Location

Physical warehouse or storage location.

**Schema**: `CreateInventoryLocationSchema` in [`inventory.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/inventory.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | UUID | Yes | Legal entity |
| `code` | string | Yes | Location code |
| `name` | string | Yes | Location name |
| `locationType` | enum | Yes | WAREHOUSE, STAGING, TRANSIT, QUARANTINE |
| `addressLine1` | string | No | Street address |
| `city` | string | No | City |
| `stateProvince` | string | No | State / province |
| `postalCode` | string | No | Postal code |
| `countryCode` | string | Yes | ISO 3166-1 alpha-2 |

---

## Lot

Batch / lot for lot-tracked inventory items.

**Schema**: `CreateLotSchema` in [`inventory.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/inventory.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inventoryItemId` | UUID | Yes | Parent inventory item |
| `lotNumber` | string | Yes | Unique lot number |
| `quantity` | number | Yes | Lot quantity |
| `expirationDate` | date string | No | Expiry date |
| `manufacturingDate` | date string | No | Manufacturing date |

---

## Serial Number

Individual serial number for serialized inventory items.

**Schema**: `CreateSerialNumberSchema` in [`inventory.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/inventory.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inventoryItemId` | UUID | Yes | Parent inventory item |
| `serialNumber` | string | Yes | Unique serial number |
| `status` | enum | Yes | AVAILABLE, ALLOCATED, SHIPPED, RETURNED |
