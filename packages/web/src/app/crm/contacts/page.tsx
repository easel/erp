"use client";

import { ListTable } from "@/components/ListTable";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface CrmContact {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	jobTitle: string;
	department: string;
}

const columns: ColumnDef<CrmContact & Record<string, unknown>>[] = [
	{
		accessorKey: "firstName",
		header: "Name",
		cell: ({ row }) => (
			<span className="font-medium">
				{row.original.firstName} {row.original.lastName}
			</span>
		),
	},
	{ accessorKey: "email", header: "Email" },
	{ accessorKey: "jobTitle", header: "Job Title" },
	{ accessorKey: "department", header: "Department" },
];

export default function ContactsPage() {
	const { entityId } = useEntityId();
	const [contacts, setContacts] = useState<CrmContact[]>([]);

	useEffect(() => {
		gql<{ crmContacts: CrmContact[] }>(
			`query CrmContacts($entityId: String!) {
				crmContacts(entityId: $entityId) {
					id firstName lastName email jobTitle department
				}
			}`,
			{ entityId },
		)
			.then((data) => setContacts(data.crmContacts))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Contacts</h1>
			<ListTable
				columns={columns}
				data={contacts as (CrmContact & Record<string, unknown>)[]}
				exportFilename="contacts"
				emptyMessage="No contacts found."
			/>
		</div>
	);
}
