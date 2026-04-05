export const WEB_VERSION = "0.0.1";

// Domain components (ADR-011 PLT-018)
export { MoneyInput } from "./components/MoneyInput.js";
export type { MoneyInputProps } from "./components/MoneyInput.js";

export { ComplianceStatusBadge } from "./components/ComplianceStatusBadge.js";
export type { ComplianceStatusBadgeProps, ComplianceTooltipInfo } from "./components/ComplianceStatusBadge.js";

export { EntitySwitcher, loadPersistedEntityId, persistEntityId, ENTITY_SWITCHER_KEY } from "./components/EntitySwitcher.js";
export type { EntityOption, EntitySwitcherProps } from "./components/EntitySwitcher.js";

export { FiscalPeriodPicker } from "./components/FiscalPeriodPicker.js";
export type { FiscalPeriodPickerProps, FiscalPeriod, FiscalYear } from "./components/FiscalPeriodPicker.js";

export { SyncStatusIndicator, OfflineBanner } from "./components/SyncStatusIndicator.js";
export type { SyncStatusIndicatorProps, SyncConnectionState } from "./components/SyncStatusIndicator.js";

export { DataTable, VIRTUALIZATION_THRESHOLD, PAGE_SIZE_OPTIONS } from "./components/DataTable.js";
export type { DataTableProps, PageSize, ColumnDef, OnChangeFn, PaginationState, SortingState, RowSelectionState } from "./components/DataTable.js";

// Utility functions
export { getDecimalPlaces, formatMoneyDisplay, parseMoneyInput, isValidMoneyAmount } from "./utils/money.js";
export { isFiscalPeriodSelectable, getFiscalPeriodWarning, FISCAL_PERIOD_LABELS } from "./utils/fiscalPeriod.js";
export { exportToCSV, downloadCSV } from "./utils/csv.js";
