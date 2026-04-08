"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface PurchaseOrder {
	id: string;
	poNumber: string;
	status: string;
	complianceStatus: string;
	currencyCode: string;
	totalAmount: number;
}

const columns: ColumnDef<PurchaseOrder & Record<string, unknown>>[] = [
	{ accessorKey: "poNumber", header: "PO #" },
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

export default function PurchaseOrdersPage() {
	const { entityId } = useEntityId();
	const [orders, setOrders] = useState<PurchaseOrder[]>([]);

	useEffect(() => {
		gql<{ purchaseOrders: PurchaseOrder[] }>(
			`query PurchaseOrders($entityId: String!) {
				purchaseOrders(entityId: $entityId) {
					id poNumber status complianceStatus currencyCode totalAmount
				}
			}`,
			{ entityId },
		)
			.then((data) => setOrders(data.purchaseOrders))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Purchase Orders</h1>
			<ListTable
				columns={columns}
				data={orders as (PurchaseOrder & Record<string, unknown>)[]}
				exportFilename="purchase-orders"
				emptyMessage="No purchase orders found."
			/>
		</div>
	);
}
