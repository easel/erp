"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Vendor {
	id: string;
	vendorCode: string;
	legalName: string;
	countryCode: string;
	defaultCurrencyCode: string;
	isActive: boolean;
}

const columns: ColumnDef<Vendor & Record<string, unknown>>[] = [
	{
		accessorKey: "vendorCode",
		header: "Vendor Code",
		cell: ({ row }) => (
			<Link
				href={`/procurement/vendors/${row.original.id}`}
				className="font-mono hover:underline"
			>
				{row.original.vendorCode}
			</Link>
		),
	},
	{ accessorKey: "legalName", header: "Legal Name" },
	{ accessorKey: "countryCode", header: "Country" },
	{ accessorKey: "defaultCurrencyCode", header: "Currency" },
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

export default function ProcurementPage() {
	const { entityId } = useEntityId();
	const [vendors, setVendors] = useState<Vendor[]>([]);

	useEffect(() => {
		gql<{ vendors: Vendor[] }>(
			`query Vendors($entityId: String!) {
				vendors(entityId: $entityId) {
					id vendorCode legalName countryCode defaultCurrencyCode isActive
				}
			}`,
			{ entityId },
		)
			.then((data) => setVendors(data.vendors))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<div className="flex items-center justify-between mb-6">
				<h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
				<Link href="/procurement/vendors/new">
					<Button>New Vendor</Button>
				</Link>
			</div>

			<ListTable
				columns={columns}
				data={vendors as (Vendor & Record<string, unknown>)[]}
				exportFilename="vendors"
				emptyMessage="No vendors found."
			/>
		</div>
	);
}
