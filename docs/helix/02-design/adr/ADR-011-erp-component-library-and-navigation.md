# ADR-011: ERP Component Library and Navigation Architecture

**Authority Level:** 4 (Design)
**Status:** Accepted
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md), [FEAT-009](../../01-frame/features/FEAT-009-platform-infrastructure.md)

---

## Context

ERP user interfaces are dense, data-heavy, and workflow-oriented. Users spend hours in the system daily, navigating between modules (Finance, Sales, Procurement, Compliance), switching between legal entities, and working with complex forms (journal entries with 100+ lines, multi-year capacity contracts). Standard component libraries (MUI, Ant Design) fight back when you need financial-specific behaviors like currency-aware inputs, fiscal period pickers, or compliance status gates.

Apogee needs a component library and navigation architecture that supports:
- Dense data display (financial tables, inventory grids)
- Domain-specific inputs (money, currencies, ITAR classifications)
- Multi-entity context switching
- Module-based navigation with persistent sidebar
- Offline-aware components (per ADR-009)
- Accessibility (WCAG 2.1 AA minimum)

## Decision

### Navigation Architecture: Next.js App Router with Module Layouts

Route structure mirrors ERP module organization:

```
app/
  layout.tsx                    → Root layout: auth gate, entity switcher, top nav
  (dashboard)/
    page.tsx                    → Dashboard (landing page)
  finance/
    layout.tsx                  → Finance module layout: sidebar with GL/AP/AR/Reports nav
    journal-entries/
      page.tsx                  → Journal entry list (DataTable)
      new/page.tsx              → Create journal entry form
      [id]/page.tsx             → Journal entry detail
    reports/
      trial-balance/page.tsx    → Trial balance report
      balance-sheet/page.tsx    → Balance sheet
  sales/
    layout.tsx                  → Sales module layout: sidebar with Quotes/Orders/Customers
    quotes/
      page.tsx                  → Quote list
      new/page.tsx              → Create quote (with CPQ)
      [id]/page.tsx             → Quote detail
    orders/
      page.tsx                  → Sales order list
      [id]/page.tsx             → Order detail with compliance status
  procurement/
    layout.tsx                  → Procurement layout
    ...
  crm/
    layout.tsx                  → CRM layout
    ...
  compliance/
    layout.tsx                  → Compliance layout: Screening/Holds/Licenses/Classifications
    screening/page.tsx          → Screening dashboard
    holds/page.tsx              → Active compliance holds
    holds/[id]/page.tsx         → Hold detail with resolution workflow
  settings/
    layout.tsx                  → System settings layout
    entities/page.tsx           → Legal entity management
    users/page.tsx              → User/role management
```

**Key navigation patterns:**

1. **Root layout** — Always visible. Contains: logo, global search (Cmd+K), entity switcher dropdown, user menu, sync status indicator (online/offline per ADR-009), notification bell.

2. **Module layouts** — Persistent sidebar within each module. Navigating between pages within a module preserves sidebar state (expanded/collapsed sections, scroll position). Module switch via top nav tabs or sidebar module icons.

3. **Entity context** — The active legal entity is set via the entity switcher in the root layout. All data queries are automatically scoped to the active entity. Entity switch triggers a page reload to ensure clean state. Users with access to a single entity see no switcher.

4. **Breadcrumbs** — Auto-generated from route segments. Clickable for navigation. Show entity context: "Acme Sat Corp > Finance > Journal Entries > JE-2026-001234".

5. **Keyboard navigation** — Cmd+K for global search, module shortcuts (G then F for Finance, G then S for Sales), Escape to close modals/drawers. Table navigation with arrow keys.

### Domain-Specific Components

Built on shadcn/ui + Radix primitives, these components encode ERP business rules into the UI layer:

#### MoneyInput
- Formats display per ISO 4217 decimal places: 2 for USD/EUR, 0 for JPY/KRW, 3 for KWD/BHD/OMR
- Validates against `MoneyAmountSchema` from @apogee/shared on every change
- Paired currency selector — amount and currency are always submitted together
- Thousand separators in display, raw number in form value
- Right-aligned (financial convention)
- Amounts are always non-negative (unsigned); sign is encoded via debit/credit type fields or separate DB columns per SD-002 and ADR-003 addendum. MoneyInput does not accept negative values — credit/adjustment contexts use a `type: DEBIT | CREDIT` selector alongside a positive amount field.
- Renders string representation internally (never JavaScript `number` per ADR-003)

#### EntitySwitcher
- Dropdown in root layout showing all entities the user has access to (per PLT-002 RBAC)
- Displays: entity name, functional currency, entity code
- Switch triggers full page data refresh scoped to new entity
- Keyboard shortcut: Cmd+E
- Persists selection in localStorage

#### ComplianceStatusBadge
- Visual indicator: pending (yellow), cleared (green), held (red)
- Tooltip shows: screening result summary, hold reason if held, timestamp
- Clicking opens compliance detail drawer
- Appears on: sales orders, purchase orders, shipments, quotes

#### DataTable (extends TanStack Table 8)
- Server-side pagination with configurable page sizes (25, 50, 100, 250)
- Column sorting (single and multi-column)
- Column filtering with type-aware filter inputs (text, date range, money range, enum select)
- Inline editing for supported columns (click to edit, Enter to save, Escape to cancel)
- Row selection with bulk actions (approve, hold, export)
- Export to CSV/Excel with current filters applied
- Virtualization for datasets > 1,000 rows
- Sticky header and first column
- Cell formatting: money (currency-aware), dates (locale-aware per PLT-011), status badges, truncated text with tooltip
- Empty state with contextual action ("No journal entries for this period. Create one →")

#### FiscalPeriodPicker
- Dropdown showing fiscal years and periods for the active entity
- Visual status indicators: FUTURE (gray), OPEN (green), SOFT_CLOSED (yellow), HARD_CLOSED (red) per ADR-007
- Prevents selection of HARD_CLOSED periods for posting forms
- Shows warning on SOFT_CLOSED: "Only adjusting entries allowed"

#### ApprovalWorkflow
- Horizontal step indicator showing workflow stages
- Current step highlighted, completed steps checked
- Each step shows: approver role, assigned user (if claimed), timestamp, decision
- Approve/Reject buttons with required comment on reject
- Escalation indicator when timeout threshold is approaching (per PLT-007 defaults)

#### CountryRegionSelector
- Country dropdown with flag icons and ISO codes
- When a country with sub-national sanctions is selected (Ukraine), shows region sub-selector
- Visual warning for embargoed countries/regions
- Integrates with export control module: selecting a restricted destination triggers inline compliance info

#### SyncStatusIndicator
- Persistent icon in root layout: green dot (connected), yellow dot (syncing), red dot (offline)
- Tooltip: "Last synced: 2 minutes ago | 3 items pending sync"
- Click to expand: shows pending sync queue, last successful sync, any sync errors
- Offline banner: "You are offline. Changes will sync when you reconnect. Compliance checks are pending."

### Accessibility Requirements

- All components meet WCAG 2.1 AA
- Radix primitives handle keyboard navigation, focus management, and ARIA attributes
- High-contrast mode support (financial data readability)
- Screen reader announcements for: compliance status changes, sync status changes, form validation errors
- Tab order follows visual layout
- All interactive elements have visible focus indicators

### Offline-Aware Component Behavior

Components are aware of the current sync state:

| Component | Online | Offline |
|-----------|--------|---------|
| MoneyInput | Normal | Normal (validation is isomorphic) |
| DataTable | Server-side pagination | Client-side pagination from SQLite cache |
| ComplianceStatusBadge | Real-time status | Shows cached status with "last checked" timestamp |
| EntitySwitcher | Full entity list from server | Entities with locally cached data only |
| Forms (submit) | Immediate server validation | Local save + "pending sync" indicator |
| Global Search | Server-side search | Local SQLite FTS search |

## Rationale

Standard component libraries impose their own design language, which conflicts with the dense, data-first UX that ERP users expect. shadcn/ui's copy-paste model gives us full control while Radix provides accessible primitives. Domain-specific components (MoneyInput, ComplianceStatusBadge) encode business rules into the UI layer, preventing entire categories of user error.

The module-based layout architecture maps to how ERP users think: "I'm in Finance doing month-end close" or "I'm in Sales processing quotes." The persistent sidebar within each module reduces navigation overhead.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| MUI / Ant Design | Opinionated styling fights ERP density requirements; overriding their design system is more work than building from primitives |
| Custom everything | Unnecessary when Radix provides accessible primitives; would delay delivery significantly |
| Single flat navigation | ERP modules have distinct workflows; flat navigation becomes unmanageable at 50+ pages |
| Tab-based multi-document interface (like NetSuite) | Complex state management; Next.js App Router with layouts achieves similar UX with simpler implementation |

## Consequences

### Positive
- Dense, data-first UX tailored to ERP workflows
- Domain-specific components prevent user errors (wrong currency format, posting to closed period)
- Offline-aware components degrade gracefully
- Accessibility built in via Radix primitives
- Module layouts reduce navigation overhead

### Negative
- Larger upfront investment building domain-specific components vs. using an off-the-shelf library
- Component behavior must be documented and tested for both online and offline modes
- Module layouts add routing complexity vs. flat page structure

## Affected Artifacts

- FEAT-009 (Platform): Add acceptance criteria for component library and navigation
- SD-001 (Architecture): Already references shadcn/ui + Radix + TanStack Table; this ADR provides the detailed patterns
- @apogee/web package: Implements these components and layouts
