"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Opportunity {
	id: string;
	name: string;
	pipelineStageId: string;
	amount: number;
	currencyCode: string;
	expectedCloseDate: string;
	probability: number;
}

const columns: ColumnDef<Opportunity & Record<string, unknown>>[] = [
	{
		accessorKey: "name",
		header: "Name",
		cell: ({ row }) => (
			<Link
				href={`/crm/opportunities/${row.original.id}`}
				className="font-medium hover:underline"
			>
				{row.original.name}
			</Link>
		),
	},
	{ accessorKey: "currencyCode", header: "Currency" },
	{
		accessorKey: "amount",
		header: "Amount",
		cell: ({ row }) => (
			<span className="font-mono">
				{Number(row.original.amount).toLocaleString(undefined, {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				})}
			</span>
		),
	},
	{ accessorKey: "expectedCloseDate", header: "Expected Close" },
	{
		accessorKey: "probability",
		header: "Probability",
		cell: ({ row }) => (
			<Badge variant={row.original.probability >= 0.5 ? "default" : "secondary"}>
				{Math.round(row.original.probability * 100)}%
			</Badge>
		),
	},
];

export default function CrmPage() {
	const { entityId } = useEntityId();
	const [opportunities, setOpportunities] = useState<Opportunity[]>([]);

	useEffect(() => {
		gql<{ opportunities: Opportunity[] }>(
			`query Opportunities($entityId: String!) {
				opportunities(entityId: $entityId) {
					id name pipelineStageId amount currencyCode expectedCloseDate probability
				}
			}`,
			{ entityId },
		)
			.then((data) => setOpportunities(data.opportunities))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Opportunities</h1>

			<ListTable
				columns={columns}
				data={opportunities as (Opportunity & Record<string, unknown>)[]}
				exportFilename="opportunities"
				emptyMessage="No opportunities found."
			/>
		</div>
	);
}
