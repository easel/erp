"use client";

import { ListTable } from "@/components/ListTable";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface CrmCompany {
	id: string;
	name: string;
	domain: string;
	industry: string;
	countryCode: string;
}

const columns: ColumnDef<CrmCompany & Record<string, unknown>>[] = [
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "domain", header: "Domain" },
	{ accessorKey: "industry", header: "Industry" },
	{ accessorKey: "countryCode", header: "Country" },
];

export default function CompaniesPage() {
	const { entityId } = useEntityId();
	const [companies, setCompanies] = useState<CrmCompany[]>([]);

	useEffect(() => {
		gql<{ crmCompanies: CrmCompany[] }>(
			`query CrmCompanies($entityId: String!) {
				crmCompanies(entityId: $entityId) {
					id name domain industry countryCode
				}
			}`,
			{ entityId },
		)
			.then((data) => setCompanies(data.crmCompanies))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Companies</h1>
			<ListTable
				columns={columns}
				data={companies as (CrmCompany & Record<string, unknown>)[]}
				exportFilename="companies"
				emptyMessage="No companies found."
			/>
		</div>
	);
}
