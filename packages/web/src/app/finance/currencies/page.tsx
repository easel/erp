"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface Currency {
	code: string;
	name: string;
	symbol: string;
	decimalPlaces: number;
	isActive: boolean;
}

const columns: ColumnDef<Currency & Record<string, unknown>>[] = [
	{ accessorKey: "code", header: "Code" },
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "symbol", header: "Symbol" },
	{ accessorKey: "decimalPlaces", header: "Decimal Places" },
	{
		accessorKey: "isActive",
		header: "Active",
		cell: ({ row }) => (
			<Badge variant={row.original.isActive ? "default" : "secondary"}>
				{row.original.isActive ? "Active" : "Inactive"}
			</Badge>
		),
	},
];

export default function CurrenciesPage() {
	const [currencies, setCurrencies] = useState<Currency[]>([]);

	useEffect(() => {
		gql<{ currencies: Currency[] }>(
			`query Currencies {
				currencies { code name symbol decimalPlaces isActive }
			}`,
		)
			.then((data) => setCurrencies(data.currencies))
			.catch(() => {});
	}, []);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Currencies</h1>
			<ListTable
				columns={columns}
				data={currencies as (Currency & Record<string, unknown>)[]}
				exportFilename="currencies"
				emptyMessage="No currencies found."
			/>
		</div>
	);
}
