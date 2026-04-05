# FEAT-004: Customer Relationship Management

**Authority Level:** 3 (Governing)
**Status:** Draft
**Created:** 2026-04-04
**Governed by:** [PRD](../prd.md)

---

## Overview

Apogee's CRM module replaces Salesforce/HubSpot with a fully integrated customer relationship management system purpose-built for satellite operator sales cycles. These cycles are long (6-18 months), complex (multi-stakeholder, multi-entity, frequently involving government and military buyers), and multinational (customers span governments, militaries, telcos, and enterprises worldwide, including conflict zones like Ukraine and Israel).

The CRM is not a bolt-on -- it is the front door to the commercial system. Contacts and companies flow into opportunities, opportunities generate quotes (FEAT-003), quotes become orders, and orders drive fulfillment and billing. Pipeline data feeds forecasting. Campaign attribution traces marketing spend to closed revenue. Customer health scoring on capacity accounts feeds renewal and upsell workflows.

By building CRM into the ERP rather than integrating an external system, Apogee eliminates the data synchronization problems, licensing costs, and vendor dependency that satellite operators currently suffer with Salesforce/HubSpot alongside NetSuite/SAP.

## User Stories

### Contact & Company Management

- **US-CRM-CC-01:** As a sales representative, I want to create and manage contact records with name, title, email, phone, and company affiliation so that I have a single source of truth for every person I interact with.
- **US-CRM-CC-02:** As an account manager, I want to map relationships between companies (parent/child, partner, competitor) so that I understand the organizational landscape of my accounts.
- **US-CRM-CC-03:** As a sales representative, I want to see all activities, opportunities, quotes, orders, and contracts associated with a contact or company on a single screen so that I have full context before any interaction.
- **US-CRM-CC-04:** As an administrator, I want to merge duplicate contact and company records while preserving all associated data so that the database stays clean.

### Pipeline Management

- **US-CRM-PM-01:** As a sales representative, I want to create opportunities with stage, value, probability, and expected close date so that my pipeline accurately reflects my active pursuits.
- **US-CRM-PM-02:** As a sales representative, I want to advance opportunities through configurable stages (e.g., Qualification, Discovery, Proposal, Negotiation, Closed Won/Lost) so that pipeline progression is tracked consistently.
- **US-CRM-PM-03:** As a sales manager, I want to view a pipeline dashboard showing opportunities by stage, rep, region, and product line with weighted and unweighted totals so that I can assess team performance and identify gaps.
- **US-CRM-PM-04:** As a sales representative, I want to link an opportunity to one or more quotes so that the commercial proposal is visible in the deal context.

### Forecasting

- **US-CRM-FC-01:** As a sales manager, I want pipeline rollup reports by rep, region, and product line showing commit, best case, and pipeline categories so that I can submit an accurate forecast.
- **US-CRM-FC-02:** As a VP of sales, I want forecast vs. quota tracking by quarter and year so that I can identify reps and regions that are ahead or behind plan.
- **US-CRM-FC-03:** As a sales manager, I want to override rep-level forecasts with manager judgment categories (commit, upside, omit) so that the forecast reflects my assessment, not just stage-weighted math.

### Lead Management

- **US-CRM-LD-01:** As a marketing manager, I want leads captured from web forms, trade shows, and imports to be automatically created in the system so that no prospect is lost.
- **US-CRM-LD-02:** As a marketing manager, I want leads scored based on configurable criteria (company size, industry, engagement level, geography) so that sales can prioritize high-potential prospects.
- **US-CRM-LD-03:** As a sales operations analyst, I want leads automatically assigned to reps based on territory rules so that response time is minimized.
- **US-CRM-LD-04:** As a sales representative, I want to convert a qualified lead into a contact, company, and opportunity with a single action so that the handoff from marketing to sales is seamless.

### Campaign Management

- **US-CRM-CP-01:** As a marketing manager, I want to create campaigns with type (trade show, webinar, email, content), budget, and date range so that marketing activities are tracked in the system.
- **US-CRM-CP-02:** As a marketing manager, I want to attribute leads and opportunities to campaigns (first-touch and multi-touch) so that I can measure which campaigns generate pipeline.
- **US-CRM-CP-03:** As a CMO, I want campaign ROI reports showing spend vs. attributed pipeline and closed revenue so that I can allocate budget to the highest-performing channels.

### Territory Management

- **US-CRM-TM-01:** As a sales operations analyst, I want to define territories based on geography (country, region), account attributes (industry, size), or named accounts so that every prospect and customer has a clear owner.
- **US-CRM-TM-02:** As a sales operations analyst, I want quotas assigned at the territory level with rollup to region and company so that forecast reporting aligns with organizational structure.
- **US-CRM-TM-03:** As a sales manager, I want to reassign territories and have existing accounts, contacts, and opportunities transfer to the new owner so that transitions are clean.

### Email Integration

- **US-CRM-EM-01:** As a sales representative, I want emails I send and receive with contacts to be automatically logged against the contact and related opportunity so that the activity history is complete without manual data entry.
- **US-CRM-EM-02:** As a sales representative, I want to send emails from pre-built templates with merge fields (contact name, company, product interest) so that outreach is consistent and efficient.
- **US-CRM-EM-03:** As a sales representative, I want to create email sequences (e.g., Day 1 intro, Day 3 follow-up, Day 7 value prop) that execute automatically so that cadenced outreach doesn't require manual tracking.

### Health Scoring

- **US-CRM-HS-01:** As an account manager, I want a health score for each capacity customer based on usage levels, support ticket volume, NPS responses, and billing status so that I can identify at-risk accounts before they churn.
- **US-CRM-HS-02:** As a VP of customer success, I want a dashboard showing all capacity customers ranked by health score with trend indicators so that I can allocate retention resources effectively.

### Competitive Tracking

- **US-CRM-CT-01:** As a sales representative, I want to log competitors on each opportunity with positioning notes so that win/loss analysis includes competitive context.
- **US-CRM-CT-02:** As a sales manager, I want win/loss reports broken down by competitor so that I can identify where we are strong and where we need to improve.

## Acceptance Criteria

### CRM-001: Contact and Company Management `Traces to: PRD CRM-001`

- AC-CRM-001-01: Contacts are created with required fields (name, email) and optional fields (title, phone, address, department).
- AC-CRM-001-02: Companies are created with required fields (name) and optional fields (industry, size, website, billing address, parent company).
- AC-CRM-001-03: Contacts are associated with one or more companies; a primary company is designated.
- AC-CRM-001-04: Company-to-company relationships are modeled with type (parent/child, partner, competitor, affiliate). Company relationships (parent, subsidiary, partner, joint_venture, reseller per ADR-005) are tracked via company_relationship records with effective dates. Relationship hierarchy is navigable in the UI with unlimited depth.
- AC-CRM-001-05: A 360-degree view on each contact and company shows all associated activities, opportunities, quotes, orders, contracts, and cases.
- AC-CRM-001-06: Duplicate detection on contact create and import compares: email (exact match), company name + contact name (fuzzy, configurable threshold, default: 0.85). Detected duplicates are presented to the user with options: merge, mark as not-duplicate, or cancel. Merge combines all child records (activities, opportunities) under the surviving record; for conflicting field values, the user selects which to retain. Merge is audit-logged.

### CRM-002: Opportunity Pipeline `Traces to: PRD CRM-002`

- AC-CRM-002-01: Opportunities are created with required fields: name, company, stage, estimated value (must be > 0), close date (must be today or future; past dates allowed only on import). Creation with missing or invalid required fields returns a 400 error identifying each invalid field.
- AC-CRM-002-02: Stages are configurable per pipeline (e.g., hardware pipeline vs. capacity pipeline may have different stages). Stage transitions follow a configurable pipeline with allowed forward and backward transitions; invalid transitions are rejected.
- AC-CRM-002-03: Each stage has a default probability used for weighted forecasting.
- AC-CRM-002-04: Stage history is logged with timestamps and duration-in-stage metrics.
- AC-CRM-002-05: Pipeline views support filtering and grouping by rep, region, product line, stage, and close-date range.
- AC-CRM-002-06: Opportunities link to one or more quotes (FEAT-003); quote status is visible on the opportunity record.

### CRM-003: Activity Tracking `Traces to: PRD CRM-003`

- AC-CRM-003-01: Activities are typed: CALL, EMAIL, MEETING, NOTE, TASK. Required fields: type, date/time, linked contact or company. Duration is optional (defaults to null).
- AC-CRM-003-02: Activities are associated with one or more contacts, companies, and/or opportunities.
- AC-CRM-003-03: Outcome is required for completed activities (values: COMPLETED, NO_ANSWER, LEFT_MESSAGE, RESCHEDULED, CANCELLED -- configurable per activity type). Notes field: max 10,000 characters.
- AC-CRM-003-04: Activities are displayed in reverse-chronological order on associated records.
- AC-CRM-003-05: Overdue tasks generate notifications to the assigned user.

### CRM-004: Sales Forecasting `Traces to: PRD CRM-004`

- AC-CRM-004-01: Forecast report rolls up pipeline by rep, region, and product line for a selected time period.
- AC-CRM-004-02: Opportunities are categorized as Commit, Best Case, or Pipeline based on stage mapping or manager override.
- AC-CRM-004-03: Forecast vs. quota comparison is available at rep, region, and company levels.
- AC-CRM-004-04: Forecast snapshots are captured weekly (configurable) and on manual submission. Snapshots are retained for 2 years (configurable). Retrievable via API with date range filter.
- AC-CRM-004-05: Forecasts can be submitted and locked by the manager for a given period.

### CRM-005: Lead Management `Traces to: PRD CRM-005`

- AC-CRM-005-01: Leads are created via API (web forms, imports) or manual entry with source tracking.
- AC-CRM-005-02: Lead score range: 0-100. Scoring criteria are configurable with weighted points (e.g., company size > 500 employees = 20 points). Criteria that reference unavailable data contribute 0 points. Default scoring model is provided; operators can customize. Score recalculation runs on lead update and on a daily batch schedule.
- AC-CRM-005-03: Assignment rules route leads to reps based on territory, round-robin, or custom logic.
- AC-CRM-005-04: Lead conversion creates a contact, company (if new), and opportunity in a single transaction.
- AC-CRM-005-05: Converted leads retain a link to the original lead record for attribution.

### CRM-006: Campaign Management `Traces to: PRD CRM-006`

- AC-CRM-006-01: Campaigns have type, status (planned, active, completed), budget, actual cost, start date, and end date.
- AC-CRM-006-02: Leads and contacts are associated with campaigns as members with status (sent, responded, converted).
- AC-CRM-006-03: First-touch attribution links the campaign that created the lead to any resulting opportunity.
- AC-CRM-006-04: Multi-touch attribution distributes pipeline credit across all campaigns a contact engaged with before opportunity creation.
- AC-CRM-006-05: ROI = (attributed closed revenue - actual cost) / actual cost. When actual cost is 0, ROI displays as 'N/A' (not calculated). Revenue attribution is snapshotted at opportunity close date.

### CRM-007: Territory Management `Traces to: PRD CRM-007`

- AC-CRM-007-01: Territories are defined with rules based on country, region, industry, company size, or named accounts.
- AC-CRM-007-02: Each territory has an assigned owner (rep) and optional overlay owners (specialist, SE).
- AC-CRM-007-03: Quotas are assigned at the territory level with rollup to parent territories and regions.
- AC-CRM-007-04: Territory reassignment bulk-transfers accounts, contacts, and open opportunities to the new owner.
- AC-CRM-007-05: Territory conflict detection flags accounts matching multiple territories for manual resolution.

### CRM-008: Email Integration `Traces to: PRD CRM-008`

- AC-CRM-008-01: Bi-directional email sync logs sent and received emails against matching contacts.
- AC-CRM-008-02: Email matching uses contact email addresses; unmatched emails are flagged for manual association.
- AC-CRM-008-03: Email templates support merge fields populated from contact, company, and opportunity records.
- AC-CRM-008-04: Email sequences execute on a defined schedule with automatic stop on reply or manual opt-out.
- AC-CRM-008-05: Email open and click tracking is available when the recipient's email client supports it.

### CRM-009: Customer Health Scoring `Traces to: PRD CRM-009`

- AC-CRM-009-01: Health score is computed from configurable weighted inputs: capacity usage %, support ticket volume, billing status (current/overdue), NPS/CSAT scores.
- AC-CRM-009-02: Health score is displayed on the company record and on capacity contract records.
- AC-CRM-009-03: Score thresholds (healthy, at-risk, critical) are configurable.
- AC-CRM-009-04: Score changes trigger notifications: any account moving from healthy to at-risk or at-risk to critical notifies the account owner and customer success team.
- AC-CRM-009-05: Health score trend (30-day, 90-day) is displayed alongside the current score.

### CRM-010: Competitive Tracking `Traces to: PRD CRM-010`

- AC-CRM-010-01: Competitor records are maintained with name, overview, strengths, weaknesses, and key differentiators.
- AC-CRM-010-02: Opportunities can be tagged with one or more competitors.
- AC-CRM-010-03: Win/loss analysis reports show win rate by competitor, deal size by competitor, and common loss reasons.
- AC-CRM-010-04: Competitive intelligence notes on an opportunity are visible to the sales team but excluded from customer-facing outputs.

## Non-Functional Requirements

| Metric | Target | Condition |
|--------|--------|-----------|
| Contact/company search response time | < 2 seconds | Across 100,000 records |
| Pipeline dashboard load time | < 3 seconds | Full pipeline view with filters applied |
| Duplicate detection on create | < 1 second | Single record creation |
| Forecast snapshot generation | < 5 minutes | 10,000 opportunities |

## Domain Model

| Entity | Description |
|--------|-------------|
| **Contact** | Individual person: name, title, email, phone, address. Associated with one or more companies. |
| **Company** | Organization: name, industry, size, website, billing address. Supports parent/child hierarchy. |
| **CompanyRelationship** | Typed link between two companies (parent/child, partner, competitor, affiliate). |
| **Opportunity** | Sales pursuit: company, value, stage, probability, close date, owner. Links to quotes. |
| **OpportunityStage** | Configurable pipeline stage with default probability and display order. |
| **Activity** | Interaction record: type (call, email, meeting, note, task), date, outcome, notes. Polymorphic association to contacts, companies, opportunities. |
| **Lead** | Unqualified prospect: source, score, status, assigned rep. Converts to contact + company + opportunity. |
| **Campaign** | Marketing initiative: type, status, budget, actual cost, date range. Members are leads/contacts. |
| **CampaignMember** | Join record linking a lead or contact to a campaign with member status. |
| **Territory** | Named region or account segment: assignment rules, owner, quota. Hierarchical. |
| **Quota** | Revenue target assigned to a territory, rep, or region for a time period. |
| **ForecastEntry** | Manager-level forecast submission: period, category (commit/best case/pipeline), amount. |
| **HealthScore** | Computed score for a capacity customer: current value, input components, timestamp. Time-series. |
| **Competitor** | Competitor profile: name, overview, strengths, weaknesses. |
| **OpportunityCompetitor** | Join record linking an opportunity to a competitor with positioning notes and outcome. |
| **EmailTemplate** | Reusable email template with merge fields and optional sequence membership. |
| **EmailSequence** | Ordered set of email templates with timing rules for automated cadenced outreach. |

## Key Workflows

### Lead-to-Opportunity-to-Quote

1. Lead is captured from web form, trade show scan, or manual entry. Source is recorded.
2. Lead scoring model evaluates the lead and assigns a numeric score.
3. Assignment rules route the lead to the appropriate rep based on territory.
4. Rep qualifies the lead through discovery activities (calls, emails, meetings).
5. Qualified lead is converted: system creates contact, company (or links to existing), and opportunity.
6. Rep advances opportunity through pipeline stages, logging activities at each step.
7. At the Proposal stage, rep creates a quote in FEAT-003 linked to the opportunity.
8. Quote approval, customer negotiation, and close cycle proceed in Sales module.
9. Closed Won opportunity updates forecast actuals and campaign attribution.

### Forecast Roll-up

1. Reps maintain opportunities with current stage, value, and close date.
2. System automatically categorizes opportunities into Commit, Best Case, or Pipeline based on stage-to-category mapping.
3. Managers review and override categories for individual opportunities (e.g., move a Best Case deal to Commit based on verbal confirmation).
4. Manager submits forecast for the period, locking the snapshot.
5. VP reviews rolled-up forecast across regions with drill-down to individual reps.
6. Forecast vs. quota comparison highlights gaps requiring pipeline generation or deal acceleration.
7. Historical snapshots enable forecast accuracy analysis (e.g., "what we forecast in Week 4 vs. what actually closed").

### Campaign Attribution

1. Marketing creates a campaign (e.g., "Satellite 2026 Trade Show") with budget and dates.
2. Leads generated at the show are created with campaign source.
3. Existing contacts who visited the booth are added as campaign members.
4. When a lead converts to an opportunity, first-touch attribution credits the originating campaign.
5. Multi-touch attribution distributes credit across all campaigns the buying contacts engaged with before opportunity creation.
6. Campaign ROI report calculates return: attributed closed revenue vs. campaign spend.
7. CMO uses ROI data to allocate budget for next quarter's marketing plan.

## Integration Points

| System | Direction | Data |
|--------|-----------|------|
| **Sales & Commercial (FEAT-003)** | Bidirectional | Opportunity-to-quote handoff; quote status on opportunities; customer master sync; renewal pipeline |
| **Financial Management (FEAT-001)** | Inbound | Closed revenue data for forecast-vs-actual and campaign ROI calculations |
| **Export Control (FEAT-006)** | Inbound | Country and entity risk flags displayed on company and contact records |
| **Orbital Asset Management (FEAT-005)** | Inbound | Capacity utilization data feeding customer health scores |
| **Email Provider** | Bidirectional | Email sync (sent/received), open/click tracking, template sends |
| **Web Forms / Marketing Automation** | Inbound | Lead capture from website, landing pages, and third-party event platforms |

## Open Design Questions

1. **CRM vs. Sales customer master ownership:** The PRD defines customer master in SLS-003 and contact/company management in CRM-001. Should there be a single shared entity (Company/Contact) used by both modules, or should CRM maintain prospect records that "graduate" to customer records in Sales upon first order? Single entity is simpler but blurs the prospect/customer distinction.

2. **Pipeline configurability depth:** Should pipelines be fully configurable (operators define their own stages, probabilities, and required fields per stage), or should Apogee ship with opinionated defaults for hardware and capacity pipelines? Configurability adds complexity; opinionated defaults may not fit all operators.

3. **Email integration architecture:** Bi-directional email sync is technically complex (IMAP/Graph API, deduplication, threading, privacy). Should the initial implementation support a specific provider (Microsoft 365, Google Workspace) or be provider-agnostic from day one? Provider-specific is faster to ship; provider-agnostic is more aligned with the self-hosted philosophy.

4. **Health score data freshness:** Health scores depend on usage data from OAM, billing data from FIN, and support ticket data (not yet specified as a module). Should health scores recompute in real-time, on a daily batch, or on-demand? What happens when input data sources are unavailable?

5. **Multi-pipeline support:** Satellite operators sell hardware and capacity through different sales motions with different stages and timelines. Should CRM support multiple concurrent pipeline definitions (hardware pipeline, capacity pipeline, services pipeline), or should all deals flow through a single unified pipeline?

6. **Conflict zone considerations:** Customers in or near conflict zones (Ukraine, Israel, others) may require special handling: restricted communication channels, enhanced screening flags, government-specific approval workflows. Should the CRM model these as territory-level rules, company-level flags, or a separate compliance overlay?
