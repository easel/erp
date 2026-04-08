"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useEffect, useState } from "react";

interface ComplianceHold {
	id: string;
	heldTable: string;
	holdReason: string;
	status: string;
	placedAt: string;
	resolvedAt: string | null;
}

const columns: ColumnDef<ComplianceHold & Record<string, unknown>>[] = [
	{
		accessorKey: "heldTable",
		header: "Held Table",
		cell: ({ row }) => (
			<Link
				href={`/compliance/holds/${row.original.id}`}
				className="font-mono hover:underline"
			>
				{row.original.heldTable}
			</Link>
		),
	},
	{ accessorKey: "holdReason", header: "Reason" },
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<Badge variant={row.original.status === "RESOLVED" ? "default" : "destructive"}>
				{row.original.status}
			</Badge>
		),
	},
	{ accessorKey: "placedAt", header: "Placed At" },
	{
		accessorKey: "resolvedAt",
		header: "Resolved At",
		cell: ({ row }) => <span>{row.original.resolvedAt ?? "--"}</span>,
	},
];

export default function CompliancePage() {
	const { entityId } = useEntityId();
	const [holds, setHolds] = useState<ComplianceHold[]>([]);

	useEffect(() => {
		gql<{ complianceHolds: ComplianceHold[] }>(
			`query ComplianceHolds($entityId: String!) {
				complianceHolds(entityId: $entityId) {
					id heldTable holdReason status placedAt resolvedAt
				}
			}`,
			{ entityId },
		)
			.then((data) => setHolds(data.complianceHolds))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Compliance Holds</h1>

			<ListTable
				columns={columns}
				data={holds as (ComplianceHold & Record<string, unknown>)[]}
				exportFilename="compliance-holds"
				emptyMessage="No compliance holds found."
			/>
		</div>
	);
}
