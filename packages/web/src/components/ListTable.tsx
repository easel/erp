"use client";

import { useMemo, useState } from "react";
import {
	DataTable,
	type ColumnDef,
	type PaginationState,
	type SortingState,
} from "./DataTable.js";

interface ListTableProps<TData extends Record<string, unknown>> {
	columns: ColumnDef<TData>[];
	data: TData[];
	exportFilename?: string;
	emptyMessage?: string;
}

export function ListTable<TData extends Record<string, unknown>>({
	columns,
	data,
	exportFilename,
	emptyMessage,
}: ListTableProps<TData>) {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 25,
	});
	const [sorting, setSorting] = useState<SortingState>([]);

	const pageData = useMemo(() => {
		const start = pagination.pageIndex * pagination.pageSize;
		return data.slice(start, start + pagination.pageSize);
	}, [data, pagination]);

	return (
		<DataTable
			columns={columns}
			data={pageData}
			totalCount={data.length}
			pagination={pagination}
			onPaginationChange={setPagination}
			sorting={sorting}
			onSortingChange={setSorting}
			{...(exportFilename !== undefined ? { exportFilename } : {})}
			{...(emptyMessage !== undefined ? { emptyMessage } : {})}
		/>
	);
}
