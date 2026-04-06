---
title: Shipments
weight: 7
---

## Carrier

Freight carrier (FedEx, DHL, etc.) with service levels.

**Schema**: `CreateCarrierSchema` in [`shipment.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/shipment.ts)

---

## Shipment

Physical shipment of goods with tracking, customs documentation, and export control paperwork.

**Schema**: `CreateShipmentSchema` in [`shipment.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/shipment.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | UUID | Yes | Legal entity |
| `salesOrderId` | UUID | No | Related sales order |
| `purchaseOrderId` | UUID | No | Related purchase order |
| `carrierId` | UUID | Yes | Carrier |
| `carrierServiceId` | UUID | No | Service level |
| `originLocationId` | UUID | Yes | Ship-from location |
| `destinationCountryCode` | string | Yes | Destination country |
| `shipDate` | date string | Yes | Ship date |
| `trackingNumber` | string | No | Carrier tracking number |

### Customs Documents

Each shipment can have multiple customs documents:

- **Commercial Invoice** — itemized invoice for customs valuation
- **Packing List** — package contents and weights
- **Shipper's Letter of Instruction (SLI)** — forwarding agent instructions
- **Electronic Export Information (EEI)** — AES filing data

**Schema**: `CreateCustomsDocumentSchema` in [`shipment.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/shipment.ts)

### Tracking Events

Shipment status updates from carrier tracking.

**Schema**: `CreateTrackingEventSchema` in [`shipment.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/shipment.ts)
