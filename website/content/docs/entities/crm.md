---
title: CRM
weight: 5
---

## CRM Company

Organization tracked in the CRM — may be a prospect, partner, or existing customer.

**Schema**: `CreateCrmCompanySchema` in [`crm.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/crm.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | UUID | Yes | Legal entity |
| `name` | string | Yes | Company name |
| `industry` | string | No | Industry vertical |
| `website` | URL | No | Company website |
| `countryCode` | string | No | Headquarters country |
| `annualRevenue` | string | No | Estimated annual revenue |
| `employeeCount` | number | No | Employee count |
| `source` | string | No | Lead source |

### Company Relationships

Companies can be linked via `CreateCompanyRelationshipSchema` — parent/subsidiary, partner, competitor, etc.

---

## CRM Contact

Individual person associated with a CRM company.

**Schema**: `CreateCrmContactSchema` in [`crm.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/crm.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `companyId` | UUID | Yes | Parent company |
| `firstName` | string | Yes | First name |
| `lastName` | string | Yes | Last name |
| `title` | string | No | Job title |
| `email` | string | No | Email address |
| `phone` | string | No | Phone number |
| `isPrimary` | boolean | No | Primary contact flag |

---

## Pipeline Stage

Stage in a sales pipeline (e.g., Qualification, Proposal, Negotiation, Closed Won).

**Schema**: `CreatePipelineStageSchema` in [`crm.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/crm.ts)

---

## Opportunity

Sales opportunity tracking value, probability, and pipeline stage progression.

**Schema**: `CreateOpportunitySchema` in [`crm.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/crm.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | UUID | Yes | Legal entity |
| `companyId` | UUID | Yes | CRM company |
| `name` | string | Yes | Opportunity name |
| `stageId` | UUID | Yes | Current pipeline stage |
| `amount` | string | No | Deal value |
| `currencyCode` | string | Yes | Deal currency |
| `probability` | number | No | Win probability (0-100) |
| `expectedCloseDate` | date string | No | Expected close date |
| `lines` | OpportunityLine[] | No | Product line items |

---

## Activity

Logged interaction — call, email, meeting, task, or note.

**Schema**: `CreateActivitySchema` in [`crm.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/crm.ts)

---

## Lead

Inbound lead before qualification into an opportunity.

**Schema**: `CreateLeadSchema` in [`crm.ts`](https://github.com/apogee-erp/apogee/blob/master/packages/shared/src/entity-schemas/crm.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | UUID | Yes | Legal entity |
| `firstName` | string | Yes | First name |
| `lastName` | string | Yes | Last name |
| `company` | string | No | Company name |
| `email` | string | No | Email |
| `phone` | string | No | Phone |
| `source` | string | No | Lead source |
| `status` | enum | No | NEW, CONTACTED, QUALIFIED, DISQUALIFIED |
