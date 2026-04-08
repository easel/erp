"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface FiscalPeriod {
	id: string;
	periodLabel: string;
	startDate: string;
	endDate: string;
	status: string;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
	switch (status) {
		case "OPEN":
			return "default";
		case "SOFT_CLOSED":
			return "outline";
		case "HARD_CLOSED":
			return "destructive";
		default:
			return "secondary";
	}
}

const columns: ColumnDef<FiscalPeriod & Record<string, unknown>>[] = [
	{ accessorKey: "periodLabel", header: "Period" },
	{ accessorKey: "startDate", header: "Start Date" },
	{ accessorKey: "endDate", header: "End Date" },
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>
		),
	},
];

export default function FiscalPeriodsPage() {
	const { entityId } = useEntityId();
	const [periods, setPeriods] = useState<FiscalPeriod[]>([]);

	useEffect(() => {
		gql<{ fiscalPeriods: FiscalPeriod[] }>(
			`query FiscalPeriods($entityId: String!) {
				fiscalPeriods(entityId: $entityId) {
					id periodLabel startDate endDate status
				}
			}`,
			{ entityId },
		)
			.then((data) => setPeriods(data.fiscalPeriods))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Fiscal Periods</h1>
			<ListTable
				columns={columns}
				data={periods as (FiscalPeriod & Record<string, unknown>)[]}
				exportFilename="fiscal-periods"
				emptyMessage="No fiscal periods found."
			/>
		</div>
	);
}
