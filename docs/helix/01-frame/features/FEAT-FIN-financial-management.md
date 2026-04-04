# FEAT-FIN: Financial Management

**Authority Level:** 3 (Governing)
**Status:** Draft
**Created:** 2026-04-04
**Governed by:** [PRD](../prd.md)

---

## Overview

The Financial Management module is the central accounting backbone of SatERP. It provides a full double-entry general ledger, multi-entity consolidation, accounts payable/receivable, multi-currency handling, revenue recognition, and financial reporting for international satellite operators. Because these operators typically maintain 10-50 legal entities across dozens of tax jurisdictions, transact in many currencies, and must comply with both US GAAP (ASC 606) and IFRS 15 revenue recognition standards, the module must support complex organizational structures while remaining auditable and performant.

Satellite operators face unique financial challenges that generic ERP systems handle poorly. Satellites are capital assets worth hundreds of millions of dollars whose useful life is measured in orbital station-keeping fuel rather than simple calendar time. Revenue contracts bundle transponder capacity, managed services, and ground equipment into multi-element arrangements requiring sophisticated allocation under ASC 606. Operators frequently conduct business in sanctioned or conflict-affected regions (e.g., Ukraine, Israel), requiring robust withholding-tax handling, sanctions-screening integration, and multi-jurisdictional compliance. This module must address all of these domain-specific requirements while providing the standard financial controls and reporting that auditors and regulators expect.

## User Stories

### GL & Multi-Entity

- As a controller, I want to maintain separate charts of accounts per legal entity so that each subsidiary's local reporting requirements are met.
- As a controller, I want to define configurable account segments (entity, department, cost center, satellite program, location) so that I can slice financial data along the dimensions the business requires.
- As a group accountant, I want to map accounts across entities to a consolidated chart of accounts so that group-level reporting is consistent even when subsidiaries use different local account structures.
- As a CFO, I want to create and close accounting periods independently per entity so that subsidiaries in different jurisdictions can close on their own schedules.
- As an auditor, I want every journal entry to be immutable once posted, with correcting entries required for adjustments, so that the audit trail is complete.

### Accounts Payable

- As an AP clerk, I want to enter vendor bills and have the system perform 3-way matching (purchase order, goods receipt, invoice) so that only legitimate charges are paid.
- As an AP manager, I want to configure automated payment runs that support ACH, domestic wire, and international SWIFT transfers so that vendors are paid on time via the correct method.
- As a controller, I want to view AP aging reports by vendor, entity, and currency so that I can manage cash outflows and identify overdue liabilities.
- As an AP clerk, I want the system to automatically calculate and apply withholding tax on vendor payments when the vendor's jurisdiction requires it so that we remain tax-compliant.
- As a procurement manager, I want tolerance-based matching rules (price variance, quantity variance) so that minor discrepancies do not block payment.

### Accounts Receivable

- As a billing analyst, I want to generate customer invoices from contract milestones and usage data so that revenue is billed accurately and on time.
- As an AR clerk, I want to apply incoming payments to open invoices (including partial payments and overpayments) so that customer balances are always current.
- As a credit manager, I want to configure automated dunning sequences (reminder, warning, final notice, collection referral) per customer segment so that overdue balances are pursued systematically.
- As a controller, I want to view AR aging reports by customer, entity, currency, and satellite program so that credit exposure is visible.
- As a finance director, I want to set credit limits per customer and receive alerts when limits are approached so that credit risk is managed proactively.

### Multi-Currency

- As a treasurer, I want to configure multiple exchange-rate sources (central banks, commercial feeds) and assign a preferred source per currency pair so that rates are accurate and auditable.
- As a controller, I want the system to automatically compute realized gain/loss when foreign-currency invoices are settled so that FX impacts are captured at transaction time.
- As a controller, I want the system to compute unrealized gain/loss during period-end revaluation of open balances so that the balance sheet reflects current FX exposure.
- As an accountant, I want every transaction to store both the functional-currency amount and the original transaction-currency amount so that I can report in either currency.
- As a treasury analyst, I want to view net FX exposure by currency across all entities so that hedging decisions are informed by accurate data.

### Revenue Recognition

- As a revenue accountant, I want to define performance obligations for satellite capacity contracts (e.g., transponder lease, managed service, ground equipment delivery) so that revenue is allocated per ASC 606 / IFRS 15.
- As a revenue accountant, I want the system to calculate standalone selling prices and allocate the total transaction price across performance obligations so that revenue is recognized in proportion to value delivered.
- As a revenue accountant, I want the system to recognize revenue over time for capacity-lease obligations and at a point in time for equipment-delivery obligations so that the recognition pattern matches the transfer of control.
- As a controller, I want revenue recognition schedules to generate journal entries automatically so that recognized and deferred revenue are always in sync with the GL.
- As an auditor, I want a full disclosure-ready report showing the waterfall of deferred revenue by contract and performance obligation so that ASC 606 disclosure requirements are met.

### Fixed Assets

- As a fixed-asset accountant, I want to define depreciation methods per asset class, including straight-line, declining balance, and units-of-production so that depreciation matches the asset's consumption pattern.
- As a satellite program manager, I want to depreciate satellites based on remaining orbital life (fuel-based units-of-production) rather than a fixed calendar schedule so that the carrying value reflects actual remaining utility.
- As a fixed-asset accountant, I want to record asset impairments and revaluations with supporting documentation so that carrying values comply with IAS 36 / ASC 360.
- As a controller, I want the system to generate depreciation journal entries automatically at period close so that fixed-asset values are always current in the GL.
- As an insurance analyst, I want to track replacement cost and insured value alongside book value so that coverage adequacy can be assessed.

### Tax Management

- As a tax analyst, I want to configure VAT/GST rates per jurisdiction and apply the correct rate automatically based on the supplier/customer location and transaction type so that indirect tax is calculated correctly.
- As a tax analyst, I want the system to determine withholding-tax obligations based on the vendor's tax residence and applicable double-tax treaties so that cross-border payments are compliant.
- As a tax manager, I want to generate VAT/GST returns per jurisdiction from the underlying transaction data so that filing is efficient and accurate.
- As a compliance officer, I want the system to flag transactions involving sanctioned jurisdictions or entities so that we do not inadvertently violate sanctions (relevant for operations near conflict zones such as Ukraine and Israel).

### Budgeting & Forecasting

- As a FP&A analyst, I want to create annual budgets at the account and cost-center level for each entity so that spending is planned and controlled.
- As a FP&A analyst, I want to create rolling forecasts that incorporate actuals-to-date and projected future periods so that the leadership team has an up-to-date financial outlook.
- As a budget owner, I want to receive alerts when actual spending approaches or exceeds budgeted amounts so that overruns are caught early.
- As a CFO, I want to compare budget vs. actual vs. forecast side by side with drill-down to transactions so that variance analysis is straightforward.

### Advanced (Hedge Accounting, Transfer Pricing, Consolidation)

- As a treasury manager, I want to designate FX forward contracts as cash-flow hedges under ASC 815 / IFRS 9 and have the system track hedge effectiveness so that qualifying gains/losses are deferred in OCI.
- As a tax director, I want to document intercompany pricing policies and generate transfer-pricing reports that include comparable-company benchmarking data so that we can defend our positions in tax audits.
- As a group accountant, I want the system to produce consolidated financial statements that automatically eliminate intercompany balances and transactions so that the group accounts are accurate.
- As a group accountant, I want to handle minority (non-controlling) interest calculations during consolidation so that equity attribution is correct.
- As a group accountant, I want to consolidate entities with different functional currencies, applying the current-rate method for balance-sheet translation and the average-rate method for income-statement translation so that CTA is computed correctly.

## Acceptance Criteria

### FIN-001: Multi-Entity Chart of Accounts

- [ ] System supports creating multiple legal entities, each with an independent chart of accounts.
- [ ] Account structures are configurable per entity with user-defined segments (e.g., entity, department, cost center, satellite program, location).
- [ ] Each segment supports configurable hierarchies (e.g., department rolls up to division).
- [ ] Accounts can be tagged with a type (asset, liability, equity, revenue, expense) and sub-type (e.g., current asset, non-current asset) for reporting classification.
- [ ] A group-level mapping table allows accounts from different entities to be mapped to a common consolidation chart of accounts.
- [ ] Account creation, modification, and deactivation are subject to approval workflow.
- [ ] Deactivated accounts cannot receive new postings but remain visible for historical queries.
- [ ] The system prevents deletion of any account that has posted transactions.
- [ ] Import/export of chart-of-accounts structures is supported in CSV and JSON formats.

### FIN-002: General Ledger

- [ ] All financial transactions are recorded as double-entry journal entries (total debits equal total credits per entry).
- [ ] Journal entries support header-level metadata: date, description, source module, reference number, posting period, and preparer.
- [ ] Journal entries support line-level metadata: account, amount, currency, cost center, satellite program, and free-text narration.
- [ ] Manual journal entries require approval by a user with the appropriate role before posting.
- [ ] Recurring journal entry templates can be defined with a frequency schedule.
- [ ] Reversing entries can be generated automatically for accruals at the start of the next period.
- [ ] Accounting periods can be opened, closed, and locked independently per entity.
- [ ] A soft-close state allows only adjusting entries by authorized users; a hard-close state prevents all postings.
- [ ] The system maintains a complete, immutable audit trail: posted entries cannot be edited or deleted; corrections require new entries.
- [ ] The GL trial balance reconciles to zero (total debits minus total credits) at all times.

### FIN-003: Accounts Payable

- [ ] Vendor master records store payment terms, default payment method, tax residence, bank details, and withholding-tax configuration.
- [ ] Vendor bills can be entered manually or imported from electronic invoice formats (e.g., UBL, Peppol).
- [ ] 3-way matching compares vendor invoice line items against purchase order lines and goods-receipt lines.
- [ ] Matching tolerances for price and quantity variances are configurable per entity or vendor.
- [ ] Invoices that pass matching are approved automatically; exceptions are routed to a review queue.
- [ ] Payment runs can be scheduled or triggered manually, selecting invoices by due date, vendor, entity, or currency.
- [ ] Payment methods supported: ACH, domestic wire, international SWIFT.
- [ ] The system generates payment files in the appropriate banking format (NACHA for ACH, SWIFT MT101/pain.001 for wire).
- [ ] AP aging reports are available with grouping by vendor, entity, currency, and aging bucket (current, 30, 60, 90, 120+ days).
- [ ] Withholding tax is calculated and applied automatically on eligible payments based on vendor tax-residence rules and treaty rates.

### FIN-004: Accounts Receivable

- [ ] Customer master records store payment terms, credit limit, default dunning profile, tax registration, and billing addresses.
- [ ] Customer invoices can be generated from contract billing schedules, manual entry, or integration with the Contract Management module.
- [ ] Incoming payments can be applied to specific invoices, distributed across multiple invoices, or placed on account as unapplied cash.
- [ ] Partial payments, overpayments, and short-payments are handled with configurable write-off thresholds.
- [ ] Dunning profiles define a sequence of actions (email reminder, formal letter, phone call task, collection referral) with configurable intervals.
- [ ] Dunning runs are executed per profile and generate the corresponding communications and tasks.
- [ ] AR aging reports are available with grouping by customer, entity, currency, satellite program, and aging bucket.
- [ ] Credit-limit enforcement prevents new invoices from being issued to customers who have exceeded their limit, with override by authorized users.
- [ ] Interest on overdue balances can be calculated and invoiced automatically where contractually or legally required.

### FIN-005: Multi-Currency

- [ ] Each legal entity has a defined functional currency; the system also supports a group reporting currency.
- [ ] Exchange rates are stored with an effective date and source identifier.
- [ ] Rates can be imported automatically from configurable external sources (e.g., ECB, Federal Reserve, commercial data feeds) on a scheduled basis.
- [ ] A preferred rate source can be configured per currency pair.
- [ ] Transactions entered in a foreign currency are recorded at both the transaction-currency amount and the functional-currency equivalent using the applicable rate.
- [ ] Realized FX gain/loss is calculated and posted automatically when a foreign-currency receivable or payable is settled at a rate different from the booking rate.
- [ ] Unrealized FX gain/loss is calculated during period-end revaluation of open foreign-currency balances and posted to the GL.
- [ ] Unrealized gain/loss entries from the prior period are automatically reversed at the start of the new period.
- [ ] FX exposure reports show net open position by currency across all entities.

### FIN-006: Intercompany Transactions

- [ ] Intercompany transactions (sales, services, loans, allocations) are recorded simultaneously in both entities with offsetting intercompany receivable/payable accounts.
- [ ] The system enforces that intercompany journal entries balance in both entities.
- [ ] An intercompany reconciliation report identifies mismatches between counterparty balances.
- [ ] During consolidation, intercompany balances and P&L transactions are eliminated automatically.
- [ ] Elimination entries are generated in a dedicated consolidation entity/journal for auditability.
- [ ] Intercompany netting is supported to reduce the number of cross-border cash settlements.

### FIN-007: Financial Reporting

- [ ] The system generates a balance sheet (statement of financial position) per entity and consolidated.
- [ ] The system generates an income statement (profit & loss) per entity and consolidated, with period and year-to-date columns.
- [ ] The system generates a cash-flow statement (indirect method) per entity and consolidated.
- [ ] The system generates a trial balance per entity with opening balance, period movement, and closing balance columns.
- [ ] All reports support drill-down from a summary line to the underlying journal entries and source documents.
- [ ] Reports can be run for any open or closed period and for any date range.
- [ ] Comparative reporting is supported (e.g., current period vs. prior period, current year vs. prior year).
- [ ] Reports can be exported to PDF, Excel, and CSV formats.
- [ ] A report-builder interface allows users to create custom financial reports using GL account ranges and segment filters.
- [ ] Row and column definitions are configurable so that report layouts can match the operator's specific disclosure requirements.

### FIN-008: Revenue Recognition (ASC 606 / IFRS 15)

- [ ] Contracts can be decomposed into distinct performance obligations (e.g., transponder capacity lease, managed service, ground equipment).
- [ ] Standalone selling price (SSP) can be determined using the adjusted-market-assessment approach, expected-cost-plus-margin approach, or residual approach as configured per obligation type.
- [ ] The total transaction price is allocated to performance obligations in proportion to their SSPs.
- [ ] Variable consideration (e.g., usage-based fees, SLA penalties) is estimated and constrained per ASC 606 guidance.
- [ ] Revenue is recognized over time for obligations satisfied over time (e.g., capacity leases), using an appropriate measure of progress (time-elapsed, output, or input method).
- [ ] Revenue is recognized at a point in time for obligations satisfied at a point in time (e.g., equipment delivery), when control transfers.
- [ ] Contract modifications (upgrades, downgrades, extensions) are handled as either a separate contract, a termination-and-creation, or a cumulative catch-up as appropriate.
- [ ] Revenue recognition schedules generate GL journal entries automatically for recognized revenue and the corresponding deferred-revenue release.
- [ ] A contract-level waterfall report shows the opening deferred-revenue balance, new bookings, recognized revenue, and closing deferred-revenue balance for each period.
- [ ] Disclosure reports support the ASC 606 and IFRS 15 quantitative and qualitative requirements (disaggregation of revenue, remaining performance obligations, significant judgments).

### FIN-009: Fixed Asset Management

- [ ] Assets are recorded with acquisition cost, acquisition date, asset class, location, and responsible entity.
- [ ] Depreciation methods supported: straight-line, declining balance, double-declining balance, sum-of-years-digits, and units-of-production.
- [ ] For satellites, a fuel-based units-of-production method is available where remaining orbital life (estimated from station-keeping fuel) drives the depreciation rate.
- [ ] Depreciation schedules are recalculated automatically when useful-life estimates or residual values change (prospective treatment).
- [ ] Asset impairments can be recorded with supporting documentation; the system adjusts the depreciation base going forward.
- [ ] Asset disposals (sale, retirement, write-off) record the gain or loss and remove the asset from the active register.
- [ ] Depreciation journal entries are generated automatically during period-end processing.
- [ ] A fixed-asset register report shows cost, accumulated depreciation, and net book value by asset, class, entity, and location.
- [ ] Assets can be transferred between entities with automatic intercompany entries and restatement of basis if required by local GAAP.

### FIN-010: Multi-Jurisdictional Tax Engine

- [ ] Tax rates and rules are configurable per jurisdiction (country, state/province, municipality).
- [ ] VAT/GST is calculated automatically on sales and purchase transactions based on the tax determination rules (place of supply, reverse charge, exempt, zero-rated).
- [ ] Withholding-tax rates are configurable per vendor tax-residence country, with treaty-rate overrides where applicable.
- [ ] The system generates periodic VAT/GST return data in the required format for each applicable jurisdiction.
- [ ] Tax codes are mapped to the appropriate GL accounts (input tax, output tax, withholding-tax payable).
- [ ] A tax audit report provides a complete listing of all transactions with their tax treatment for a given period and jurisdiction.
- [ ] The system flags transactions involving sanctioned or conflict-affected jurisdictions for compliance review before processing.

### FIN-011: Budgeting and Forecasting

- [ ] Annual budgets can be created at the account, cost-center, and entity level.
- [ ] Budget entry supports manual input, spreading (even, seasonal pattern, trend-based), and import from spreadsheets.
- [ ] Budget versions are supported (e.g., original budget, revised budget Q2) so that historical budget snapshots are preserved.
- [ ] Rolling forecasts can be maintained alongside budgets, incorporating actuals-to-date for elapsed periods.
- [ ] Budget vs. actual vs. forecast variance reports are available with drill-down to transaction detail.
- [ ] Budget threshold alerts notify designated users when spending reaches configurable percentages (e.g., 80%, 100%) of budget.
- [ ] Budget approval workflows route proposed budgets through the required sign-off chain.

### FIN-012: Hedge Accounting

- [ ] Hedging relationships can be designated, linking a hedging instrument (e.g., FX forward) to a hedged item (e.g., forecast foreign-currency revenue).
- [ ] Supported hedge types: cash-flow hedge and fair-value hedge per ASC 815 / IFRS 9.
- [ ] The system tracks hedge effectiveness using the dollar-offset method or regression analysis on a configurable schedule.
- [ ] For qualifying cash-flow hedges, the effective portion of the gain/loss on the hedging instrument is recorded in OCI; the ineffective portion is recorded in P&L.
- [ ] When the hedged transaction occurs, the cumulative amount in OCI is reclassified to P&L.
- [ ] De-designation of a hedge relationship is supported, with appropriate accounting treatment of the amounts remaining in OCI.
- [ ] A hedge-documentation report captures all required elements: risk management objective, hedging instrument, hedged item, effectiveness assessment method, and test results.

### FIN-013: Transfer Pricing Documentation

- [ ] Intercompany transactions are categorized by type (services, tangible goods, intangible property, financial transactions).
- [ ] Transfer-pricing policies can be documented per transaction type and entity pair (e.g., cost-plus markup for shared services).
- [ ] The system records the pricing method applied to each intercompany transaction (CUP, cost-plus, TNMM, profit-split, resale-minus).
- [ ] A master-file and local-file report structure aligned with OECD BEPS Action 13 can be generated.
- [ ] The system captures and stores comparable-company benchmarking data to support arm's-length pricing assertions.
- [ ] Annual transfer-pricing summary reports are generated per entity showing volumes, margins, and methods by transaction type.

### FIN-014: Consolidated Financial Statements

- [ ] A consolidation scope defines which entities are included and their ownership percentages.
- [ ] Full consolidation is applied for majority-owned subsidiaries; equity method for significant-influence investments.
- [ ] Intercompany eliminations (balances, revenue/expense, unrealized profit on intercompany transfers) are generated automatically.
- [ ] Minority (non-controlling) interest is calculated as the minority share of each subsidiary's net assets and net income.
- [ ] Currency translation applies the closing rate to balance-sheet items and the average rate to income-statement items, with the resulting CTA posted to equity.
- [ ] A consolidation journal captures all elimination and translation entries for audit review.
- [ ] Consolidated financial statements (balance sheet, income statement, cash flow, statement of changes in equity) are produced with full drill-down to entity-level detail.
- [ ] The consolidation can be run for any closed period and rerun after adjustments, producing a new version with a clear audit trail of changes.

## Domain Model

Key entities and their relationships:

- **LegalEntity** -- Represents a subsidiary or operating company. Has a functional currency, jurisdiction, chart of accounts, and fiscal calendar. Belongs to one ConsolidationGroup.
- **ConsolidationGroup** -- Defines the set of entities to be consolidated, along with ownership percentages and the group reporting currency.
- **ChartOfAccounts** -- A structured list of accounts for a single legal entity. Contains Accounts organized by segments.
- **Account** -- A single GL account with a code, name, type (asset/liability/equity/revenue/expense), sub-type, and segment values. Belongs to one ChartOfAccounts. Can be mapped to a ConsolidationAccount.
- **AccountSegment** -- A configurable dimension on an account (e.g., department, cost center, satellite program). Supports hierarchical roll-up.
- **Period** -- An accounting period (month, quarter, year) for a legal entity. Has a status: open, soft-closed, or hard-closed.
- **JournalEntry** -- A complete accounting transaction. Contains a header (date, description, period, source, status) and two or more JournalLines. Immutable once posted.
- **JournalLine** -- A single debit or credit within a JournalEntry. References an Account, amount, currency, and optional dimensions (cost center, satellite program, intercompany partner).
- **Vendor** -- An external supplier with payment terms, bank details, tax residence, and withholding-tax configuration. Source for AP transactions.
- **Customer** -- A buyer of satellite capacity or services with payment terms, credit limit, dunning profile, and tax registration. Source for AR transactions.
- **Invoice** -- Either an AP vendor bill or an AR customer invoice. Contains line items, tax calculations, payment terms, and matching status (for AP).
- **Payment** -- A disbursement (AP) or receipt (AR). Links to one or more invoices. Records the payment method, bank account, and FX rate at settlement.
- **ExchangeRate** -- A rate for a currency pair on a given date from a given source. Used for transaction conversion and period-end revaluation.
- **Contract** -- (Integration point with Contract Management module.) Represents a customer agreement that drives AR billing and revenue recognition.
- **PerformanceObligation** -- A distinct promise within a Contract for revenue-recognition purposes. Has a standalone selling price, recognition pattern (over-time or point-in-time), and allocated transaction price.
- **RevenueSchedule** -- A time-phased plan for recognizing revenue for a PerformanceObligation. Generates JournalEntries each period.
- **FixedAsset** -- A capitalized asset (satellite, ground station, equipment). Has acquisition cost, residual value, useful life (calendar or fuel-based), depreciation method, and accumulated depreciation.
- **DepreciationSchedule** -- A time-phased plan for depreciating a FixedAsset. Generates JournalEntries each period.
- **Budget** -- A financial plan for a set of accounts, cost centers, and periods within an entity. Has a version and approval status.
- **HedgingRelationship** -- Links a hedging instrument to a hedged item with designation type, effectiveness test schedule, and OCI tracking.
- **TransferPricingPolicy** -- Documents the pricing methodology for a category of intercompany transactions between a pair of entities.
- **EliminationEntry** -- A consolidation-specific journal entry that removes intercompany balances and transactions during group reporting.

## Key Workflows

### Month-End Close

1. **Cutoff.** AP and AR teams complete entry of all transactions for the period. Purchasing confirms all goods receipts are recorded.
2. **Accruals.** Accountants post accrual journal entries for expenses incurred but not yet invoiced (e.g., satellite insurance, orbital slot fees).
3. **Depreciation.** The system generates depreciation entries for all fixed assets, including fuel-based satellite depreciation updated with the latest telemetry-derived fuel estimates.
4. **Revenue Recognition.** The revenue-recognition engine processes all active contracts, generating entries to move revenue from deferred to recognized based on the period's progress.
5. **FX Revaluation.** The system revalues all open foreign-currency balances (AP, AR, bank, intercompany) at the period-end exchange rate, posting unrealized gain/loss entries.
6. **Intercompany Reconciliation.** The intercompany reconciliation report is reviewed; any mismatches are investigated and corrected.
7. **Tax Calculation.** VAT/GST return data is generated; withholding-tax accruals are reviewed.
8. **Trial Balance Review.** The controller reviews the trial balance and supporting schedules (bank reconciliation, subledger-to-GL reconciliation).
9. **Adjustments.** Any correcting or adjusting entries are posted.
10. **Soft Close.** The period is soft-closed, restricting further posting to authorized adjusting entries only.
11. **Final Review and Hard Close.** After management review, the period is hard-closed. No further entries are permitted.
12. **Reporting.** Financial statements (balance sheet, income statement, cash flow) are generated for the closed period.

### Intercompany Transaction

1. **Initiation.** Entity A records a sale of satellite capacity management services to Entity B. The transaction references the applicable transfer-pricing policy.
2. **Dual Posting.** The system simultaneously creates:
   - In Entity A: Revenue (P&L) and an intercompany receivable (balance sheet).
   - In Entity B: Expense (P&L) and an intercompany payable (balance sheet).
3. **Currency Handling.** If the entities have different functional currencies, each side records the transaction at the applicable exchange rate. Any difference is tracked for consolidation.
4. **Reconciliation.** The intercompany reconciliation report confirms that the receivable in Entity A matches the payable in Entity B (or flags discrepancies).
5. **Netting.** At the agreed netting cycle (e.g., monthly), all intercompany receivables and payables between each entity pair are netted, and only the net amount is settled in cash.
6. **Settlement.** The net cash payment is recorded, and realized FX gain/loss is posted if the settlement rate differs from the booking rate.
7. **Consolidation Elimination.** During consolidated reporting, the system generates elimination entries to remove the intercompany revenue/expense and receivable/payable.

### Revenue Recognition (ASC 606)

1. **Contract Identification.** A new customer contract is created (or received from the Contract Management module). The revenue accountant confirms it meets the ASC 606 Step 1 criteria (enforceable rights and obligations, commercial substance, collectibility).
2. **Performance Obligation Identification.** The contract is decomposed into distinct performance obligations:
   - Example: 5-year Ku-band transponder capacity lease (over-time), ground terminal equipment delivery (point-in-time), and network monitoring managed service (over-time).
3. **Transaction Price Determination.** The total transaction price is determined, including fixed fees and estimated variable consideration (e.g., usage overages). A constraint is applied to variable consideration to limit it to amounts not expected to reverse.
4. **SSP Determination and Allocation.** Standalone selling prices are determined for each obligation using the configured method. The transaction price is allocated in proportion to SSPs.
5. **Recognition Scheduling.** For each obligation:
   - *Transponder lease:* Revenue is recognized ratably over the 5-year term (time-elapsed method).
   - *Ground equipment:* Revenue is recognized upon delivery and customer acceptance.
   - *Managed service:* Revenue is recognized ratably over the service term.
6. **Period Processing.** Each accounting period, the revenue engine calculates the revenue to be recognized per obligation and generates journal entries (debit deferred revenue, credit recognized revenue).
7. **Modification Handling.** If the contract is modified (e.g., customer upgrades to a higher-capacity transponder), the system evaluates whether the modification is a separate contract, a termination-and-creation, or a cumulative catch-up, and adjusts schedules accordingly.
8. **Disclosure Reporting.** At period end, the system produces the required ASC 606 disclosures: disaggregated revenue, deferred-revenue waterfall, remaining performance obligations, and significant judgments.

## Integration Points

### Internal SatERP Modules

- **Contract Management.** Contracts flow into FIN for billing (AR) and revenue recognition (ASC 606). Contract modifications trigger re-evaluation of performance obligations.
- **Procurement.** Purchase orders and goods receipts feed 3-way matching in AP. Vendor master data is shared.
- **Satellite Operations / Fleet Management.** Fuel telemetry data (remaining station-keeping propellant) feeds the fixed-asset module to update orbital-life-based depreciation estimates for each satellite.
- **CRM / Sales.** Customer master data and credit-limit checks are shared with AR. Sales-order data may initiate billing events.
- **Human Resources / Payroll.** Payroll journal entries are posted to the GL. Cost-center allocations for labor are provided.
- **Project Accounting.** Capital project costs are accumulated and transferred to the fixed-asset register upon project completion (e.g., satellite construction).

### External Systems

- **Banking / Treasury.** Payment files (NACHA, SWIFT MT101, ISO 20022 pain.001) are exported for AP payment runs. Bank statement files (MT940, CAMT.053) are imported for reconciliation. Direct bank API integration is a future option.
- **Exchange-Rate Providers.** Automated daily import of exchange rates from ECB, Federal Reserve FRED, or commercial providers (e.g., Refinitiv, Bloomberg).
- **Tax Filing Systems.** VAT/GST return data is exported in jurisdiction-specific formats for submission via local e-filing portals or tax compliance platforms (e.g., Avalara, Vertex).
- **Audit / Compliance.** GL data and supporting documents are exportable in standard audit file formats (SAF-T, OECD SAF-T schema) for external auditors.
- **Sanctions Screening.** Transaction and counterparty data is checked against sanctions lists (OFAC SDN, EU consolidated list, UN Security Council) via integration with a screening provider.
- **Consolidation / BI Tools.** While FIN includes built-in consolidation, data can also be exported to external consolidation tools (e.g., OneStream, Hyperion) or BI platforms (e.g., Power BI, Tableau) via API or scheduled extracts.

## Open Design Questions

1. **Consolidation entity vs. virtual entity.** Should the consolidation layer be modeled as its own "virtual" legal entity with a separate GL, or should it be a reporting-only construct that generates elimination entries on the fly? A dedicated entity simplifies audit trails but adds storage overhead.

2. **Real-time vs. batch revenue recognition.** Should the revenue-recognition engine run in real time (posting entries as events occur) or in batch (during period-end close)? Real-time provides up-to-date deferred-revenue balances but increases system load and complicates error correction.

3. **Orbital-life depreciation data source.** How frequently should fuel telemetry data update the depreciation model? Daily updates provide accuracy but create frequent GL adjustments; monthly or quarterly may be sufficient and less disruptive.

4. **Sanctions screening integration depth.** Should FIN perform sanctions screening inline (blocking transactions that match) or asynchronously (flagging for review)? Inline blocking is safer but may create false-positive bottlenecks in high-volume payment runs.

5. **Multi-GAAP book.** Some operators must report under both US GAAP and IFRS. Should the system support parallel accounting books (separate GL entries per standard) or a single book with adjustment layers? Parallel books are cleaner but double the transaction volume.

6. **Payment hub architecture.** Should payment processing (ACH, SWIFT, wire) be handled directly within FIN or delegated to a separate Payment Hub module that FIN submits payment requests to? A separate hub would allow other modules (e.g., Payroll) to share payment infrastructure.

7. **Subledger architecture.** Should AP, AR, and FA be modeled as subledgers that summarize to the GL, or should all detail live directly in the GL? Subledgers reduce GL volume but add reconciliation requirements.

8. **Conflict-zone compliance.** For operators providing services in active conflict zones (Ukraine, Israel), what level of transaction-level documentation and approval workflow is required beyond sanctions screening? Should FIN enforce jurisdiction-specific approval chains, or should this be handled by a separate Compliance module?
