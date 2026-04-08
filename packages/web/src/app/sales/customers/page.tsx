"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface Customer {
	id: string;
	customerCode: string;
	legalName: string;
	countryCode: string;
	defaultCurrencyCode: string;
	isActive: boolean;
}

const columns: ColumnDef<Customer & Record<string, unknown>>[] = [
	{ accessorKey: "customerCode", header: "Customer Code" },
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

export default function CustomersPage() {
	const { entityId } = useEntityId();
	const [customers, setCustomers] = useState<Customer[]>([]);

	useEffect(() => {
		gql<{ customers: Customer[] }>(
			`query Customers($entityId: String!) {
				customers(entityId: $entityId) {
					id customerCode legalName countryCode defaultCurrencyCode isActive
				}
			}`,
			{ entityId },
		)
			.then((data) => setCustomers(data.customers))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Customers</h1>
			<ListTable
				columns={columns}
				data={customers as (Customer & Record<string, unknown>)[]}
				exportFilename="customers"
				emptyMessage="No customers found."
			/>
		</div>
	);
}
