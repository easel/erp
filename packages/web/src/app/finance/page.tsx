"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useEffect, useState } from "react";

interface JournalEntry {
	id: string;
	entryNumber: string;
	entryDate: string;
	description: string;
	status: string;
	sourceModule: string;
}

const columns: ColumnDef<JournalEntry & Record<string, unknown>>[] = [
	{
		accessorKey: "entryNumber",
		header: "Entry #",
		cell: ({ row }) => (
			<Link
				href={`/finance/journal-entries/${row.original.id}`}
				className="font-mono hover:underline"
			>
				{row.original.entryNumber}
			</Link>
		),
	},
	{ accessorKey: "entryDate", header: "Date" },
	{ accessorKey: "description", header: "Description" },
	{ accessorKey: "sourceModule", header: "Source" },
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<Badge variant={row.original.status === "POSTED" ? "default" : "secondary"}>
				{row.original.status}
			</Badge>
		),
	},
];

export default function FinancePage() {
	const { entityId } = useEntityId();
	const [entries, setEntries] = useState<JournalEntry[]>([]);

	useEffect(() => {
		gql<{ journalEntries: JournalEntry[] }>(
			`query JournalEntries($entityId: String!) {
				journalEntries(entityId: $entityId) {
					id entryNumber entryDate description status sourceModule
				}
			}`,
			{ entityId },
		)
			.then((data) => setEntries(data.journalEntries))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<div className="flex items-center justify-between mb-6">
				<h1 className="text-2xl font-bold tracking-tight">Journal Entries</h1>
				<Link href="/finance/journal-entries/new">
					<Button>New Entry</Button>
				</Link>
			</div>

			<ListTable
				columns={columns}
				data={entries as (JournalEntry & Record<string, unknown>)[]}
				exportFilename="journal-entries"
				emptyMessage="No journal entries found."
			/>
		</div>
	);
}
