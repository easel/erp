"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface CountryRestriction {
	id: string;
	name: string;
	description: string;
	isActive: boolean;
}

const columns: ColumnDef<CountryRestriction & Record<string, unknown>>[] = [
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "description", header: "Description" },
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

export default function CountryRestrictionsPage() {
	const { entityId } = useEntityId();
	const [restrictions, setRestrictions] = useState<CountryRestriction[]>([]);

	useEffect(() => {
		gql<{ countryRestrictions: CountryRestriction[] }>(
			`query CountryRestrictions($entityId: String!) {
				countryRestrictions(entityId: $entityId) {
					id name description isActive
				}
			}`,
			{ entityId },
		)
			.then((data) => setRestrictions(data.countryRestrictions))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Country Restrictions</h1>
			<ListTable
				columns={columns}
				data={restrictions as (CountryRestriction & Record<string, unknown>)[]}
				exportFilename="country-restrictions"
				emptyMessage="No country restrictions found."
			/>
		</div>
	);
}
