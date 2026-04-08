"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface ScreeningList {
	id: string;
	code: string;
	name: string;
	sourceAuthority: string;
	isActive: boolean;
}

const columns: ColumnDef<ScreeningList & Record<string, unknown>>[] = [
	{ accessorKey: "code", header: "Code" },
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "sourceAuthority", header: "Source Authority" },
	{
		accessorKey: "isActive",
		header: "Status",
		cell: ({ row }) => (
			<Badge variant={row.original.isActive ? "default" : "secondary"}>
				{row.original.isActive ? "Active" : "Inactive"}
			</Badge>
		),
	},
];

export default function ScreeningListsPage() {
	const [lists, setLists] = useState<ScreeningList[]>([]);

	useEffect(() => {
		gql<{ screeningLists: ScreeningList[] }>(
			`query ScreeningLists {
				screeningLists { id code name sourceAuthority isActive }
			}`,
		)
			.then((data) => setLists(data.screeningLists))
			.catch(() => {});
	}, []);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Screening Lists</h1>
			<ListTable
				columns={columns}
				data={lists as (ScreeningList & Record<string, unknown>)[]}
				exportFilename="screening-lists"
				emptyMessage="No screening lists found."
			/>
		</div>
	);
}
