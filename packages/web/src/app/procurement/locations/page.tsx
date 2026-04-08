"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface InventoryLocation {
	id: string;
	locationCode: string;
	name: string;
	isActive: boolean;
}

const columns: ColumnDef<InventoryLocation & Record<string, unknown>>[] = [
	{ accessorKey: "locationCode", header: "Location Code" },
	{ accessorKey: "name", header: "Name" },
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

export default function LocationsPage() {
	const { entityId } = useEntityId();
	const [locations, setLocations] = useState<InventoryLocation[]>([]);

	useEffect(() => {
		gql<{ inventoryLocations: InventoryLocation[] }>(
			`query InventoryLocations($entityId: String!) {
				inventoryLocations(entityId: $entityId) {
					id locationCode name isActive
				}
			}`,
			{ entityId },
		)
			.then((data) => setLocations(data.inventoryLocations))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Inventory Locations</h1>
			<ListTable
				columns={columns}
				data={locations as (InventoryLocation & Record<string, unknown>)[]}
				exportFilename="locations"
				emptyMessage="No locations found."
			/>
		</div>
	);
}
