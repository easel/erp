---
title: Apogee ERP
layout: hextra-home
---

{{< hextra/hero-badge link="https://github.com/apogee-erp/apogee" >}}
  <span>Open Source</span>
  {{< icon name="arrow-circle-right" attributes="height=14" >}}
{{< /hextra/hero-badge >}}

<div class="hx-mt-6 hx-mb-6">
{{< hextra/hero-headline >}}
  ERP built for satellite operators.&nbsp;<br class="sm:hx-block hx-hidden" />From quote to compliance.
{{< /hextra/hero-headline >}}
</div>

<div class="hx-mb-12">
{{< hextra/hero-subtitle >}}
  Open-source enterprise resource planning for international satellite and space-technology companies — procurement, sales, finance, inventory, CRM, and export-control compliance in one system.
{{< /hextra/hero-subtitle >}}
</div>

<div class="hx-mb-12">
{{< hextra/hero-button text="Get Started" link="docs/getting-started" >}}
{{< hextra/hero-button text="Entity Catalog" link="docs/entities" style="alt" >}}
</div>

<div class="hx-mt-8"></div>

{{< hextra/feature-grid >}}
  {{< hextra/feature-card
    title="Finance & GL"
    subtitle="Multi-currency chart of accounts, journal entries, fiscal periods, and exchange-rate management."
  >}}
  {{< hextra/feature-card
    title="Sales"
    subtitle="Customers, quotes, sales orders, invoices, and returns — with real-time compliance screening."
  >}}
  {{< hextra/feature-card
    title="Procurement"
    subtitle="Vendors, purchase orders, goods receipts, vendor bills, and payment batches."
  >}}
  {{< hextra/feature-card
    title="Inventory"
    subtitle="Items, lots, serial numbers, and warehouse locations with full traceability."
  >}}
  {{< hextra/feature-card
    title="CRM"
    subtitle="Companies, contacts, opportunities, pipeline stages, activities, and leads."
  >}}
  {{< hextra/feature-card
    title="Export Compliance"
    subtitle="ITAR/EAR classification, denied-party screening, country restrictions, and compliance holds."
  >}}
{{< /hextra/feature-grid >}}

<div class="hx-mt-16"></div>

## Why Apogee?

Satellite operators juggle ITAR/EAR controls, multi-currency billing, complex procurement chains, and high-value service contracts. General-purpose ERP systems require expensive customization for these workflows. Apogee provides domain-specific data models and compliance logic out of the box:

- **Compliance-first** — denied-party screening and country-restriction rules are first-class entities, not bolt-on reports
- **Multi-currency native** — exchange rates, currency codes, and monetary amounts are typed throughout the schema
- **GraphQL API** — typed, introspectable API with code-first schema (Pothos + GraphQL Yoga)
- **Open source** — MIT license, no vendor lock-in, deploy anywhere
