export const WEB_VERSION = "0.0.1";

// Navigation architecture (ADR-011 PLT-019)
export { RootLayout } from "./components/RootLayout.js";
export type { RootLayoutProps } from "./components/RootLayout.js";

export { ModuleLayout } from "./components/ModuleLayout.js";
export type { ModuleLayoutProps } from "./components/ModuleLayout.js";

export {
	ModuleSidebar,
	FINANCE_NAV,
	SALES_NAV,
	PROCUREMENT_NAV,
	CRM_NAV,
	COMPLIANCE_NAV,
	SETTINGS_NAV,
} from "./components/ModuleSidebar.js";
export type { ModuleSidebarProps, SidebarNavItem } from "./components/ModuleSidebar.js";

export { Breadcrumbs, buildBreadcrumbs } from "./components/Breadcrumbs.js";
export type { BreadcrumbsProps, BreadcrumbSegment } from "./components/Breadcrumbs.js";

export { GlobalSearch } from "./components/GlobalSearch.js";
export type { GlobalSearchProps, SearchResult, AppModule } from "./components/GlobalSearch.js";

export { NotificationBell } from "./components/NotificationBell.js";
export type { NotificationBellProps, AppNotification } from "./components/NotificationBell.js";

// Domain components (ADR-011 PLT-018)
export { MoneyInput } from "./components/MoneyInput.js";
export type { MoneyInputProps } from "./components/MoneyInput.js";

export { ComplianceStatusBadge } from "./components/ComplianceStatusBadge.js";
export type {
	ComplianceStatusBadgeProps,
	ComplianceTooltipInfo,
} from "./components/ComplianceStatusBadge.js";

export {
	EntitySwitcher,
	loadPersistedEntityId,
	persistEntityId,
	ENTITY_SWITCHER_KEY,
} from "./components/EntitySwitcher.js";
export type { EntityOption, EntitySwitcherProps } from "./components/EntitySwitcher.js";

export { FiscalPeriodPicker } from "./components/FiscalPeriodPicker.js";
export type {
	FiscalPeriodPickerProps,
	FiscalPeriod,
	FiscalYear,
} from "./components/FiscalPeriodPicker.js";

export { SyncStatusIndicator, OfflineBanner } from "./components/SyncStatusIndicator.js";
export type {
	SyncStatusIndicatorProps,
	SyncConnectionState,
} from "./components/SyncStatusIndicator.js";

export { DataTable, VIRTUALIZATION_THRESHOLD, PAGE_SIZE_OPTIONS } from "./components/DataTable.js";
export type {
	DataTableProps,
	PageSize,
	ColumnDef,
	OnChangeFn,
	PaginationState,
	SortingState,
	RowSelectionState,
} from "./components/DataTable.js";

// Utility functions
export {
	getDecimalPlaces,
	formatMoneyDisplay,
	parseMoneyInput,
	isValidMoneyAmount,
} from "./utils/money.js";
export {
	isFiscalPeriodSelectable,
	getFiscalPeriodWarning,
	FISCAL_PERIOD_LABELS,
} from "./utils/fiscalPeriod.js";
export { exportToCSV, downloadCSV } from "./utils/csv.js";
