---
title: Entity Catalog
weight: 3
---

Every business entity in Apogee, organized by module. Each entity is defined as a Zod schema in [`@apogee/shared`](https://github.com/apogee-erp/apogee/tree/master/packages/shared/src/entity-schemas) and exposed through the GraphQL API.

{{< cards >}}
  {{< card link="finance" title="Finance" subtitle="Accounts, journal entries, fiscal periods, currencies, exchange rates." >}}
  {{< card link="sales" title="Sales" subtitle="Customers, products, quotes, sales orders, invoices, returns." >}}
  {{< card link="procurement" title="Procurement" subtitle="Vendors, purchase orders, goods receipts, vendor bills, payments." >}}
  {{< card link="inventory" title="Inventory" subtitle="Items, lots, serial numbers, warehouse locations." >}}
  {{< card link="crm" title="CRM" subtitle="Companies, contacts, opportunities, pipeline stages, leads, activities." >}}
  {{< card link="compliance" title="Compliance" subtitle="Screening lists, compliance holds, country restrictions, restricted regions." >}}
{{< /cards >}}
