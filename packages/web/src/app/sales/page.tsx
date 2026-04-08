"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useEffect, useState } from "react";

interface SalesOrder {
	id: string;
	orderNumber: string;
	status: string;
	complianceStatus: string;
	currencyCode: string;
	totalAmount: number;
}

const columns: ColumnDef<SalesOrder & Record<string, unknown>>[] = [
	{
		accessorKey: "orderNumber",
		header: "Order #",
		cell: ({ row }) => (
			<Link href={`/sales/${row.original.id}`} className="font-mono hover:underline">
				{row.original.orderNumber}
			</Link>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<Badge variant={row.original.status === "CONFIRMED" ? "default" : "secondary"}>
				{row.original.status}
			</Badge>
		),
	},
	{
		accessorKey: "complianceStatus",
		header: "Compliance",
		cell: ({ row }) => (
			<Badge variant={row.original.complianceStatus === "CLEAR" ? "default" : "destructive"}>
				{row.original.complianceStatus}
			</Badge>
		),
	},
	{ accessorKey: "currencyCode", header: "Currency" },
	{
		accessorKey: "totalAmount",
		header: "Total Amount",
		cell: ({ row }) => (
			<span className="font-mono">
				{Number(row.original.totalAmount).toLocaleString(undefined, {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				})}
			</span>
		),
	},
];

export default function SalesPage() {
	const { entityId } = useEntityId();
	const [orders, setOrders] = useState<SalesOrder[]>([]);

	useEffect(() => {
		gql<{ salesOrders: SalesOrder[] }>(
			`query SalesOrders($entityId: String!) {
				salesOrders(entityId: $entityId) {
					id orderNumber status complianceStatus currencyCode totalAmount
				}
			}`,
			{ entityId },
		)
			.then((data) => setOrders(data.salesOrders))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Sales Orders</h1>

			<ListTable
				columns={columns}
				data={orders as (SalesOrder & Record<string, unknown>)[]}
				exportFilename="sales-orders"
				emptyMessage="No sales orders found."
			/>
		</div>
	);
}
