"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface Account {
	id: string;
	accountNumber: string;
	name: string;
	accountType: string;
	normalBalance: string;
	isHeader: boolean;
	isActive: boolean;
}

const columns: ColumnDef<Account & Record<string, unknown>>[] = [
	{ accessorKey: "accountNumber", header: "Account #" },
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "accountType", header: "Type" },
	{ accessorKey: "normalBalance", header: "Normal Balance" },
	{
		accessorKey: "isActive",
		header: "Active",
		cell: ({ row }) => (
			<Badge variant={row.original.isActive ? "default" : "secondary"}>
				{row.original.isActive ? "Active" : "Inactive"}
			</Badge>
		),
	},
];

export default function AccountsPage() {
	const { entityId } = useEntityId();
	const [accounts, setAccounts] = useState<Account[]>([]);

	useEffect(() => {
		gql<{ accounts: Account[] }>(
			`query Accounts($entityId: String!) {
				accounts(entityId: $entityId) {
					id accountNumber name accountType normalBalance isHeader isActive
				}
			}`,
			{ entityId },
		)
			.then((data) => setAccounts(data.accounts))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Chart of Accounts</h1>
			<ListTable
				columns={columns}
				data={accounts as (Account & Record<string, unknown>)[]}
				exportFilename="accounts"
				emptyMessage="No accounts found."
			/>
		</div>
	);
}
