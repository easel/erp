"use client";

import { ListTable } from "@/components/ListTable";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface RestrictedRegion {
	id: string;
	countryCode: string;
	regionName: string;
	sanctionsRegime: string;
	sourceAuthority: string;
}

const columns: ColumnDef<RestrictedRegion & Record<string, unknown>>[] = [
	{ accessorKey: "countryCode", header: "Country" },
	{ accessorKey: "regionName", header: "Region" },
	{ accessorKey: "sanctionsRegime", header: "Sanctions Regime" },
	{ accessorKey: "sourceAuthority", header: "Source" },
];

export default function RestrictedRegionsPage() {
	const [regions, setRegions] = useState<RestrictedRegion[]>([]);

	useEffect(() => {
		gql<{ restrictedRegions: RestrictedRegion[] }>(
			`query RestrictedRegions {
				restrictedRegions { id countryCode regionName sanctionsRegime sourceAuthority }
			}`,
		)
			.then((data) => setRegions(data.restrictedRegions))
			.catch(() => {});
	}, []);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Restricted Regions</h1>
			<ListTable
				columns={columns}
				data={regions as (RestrictedRegion & Record<string, unknown>)[]}
				exportFilename="restricted-regions"
				emptyMessage="No restricted regions found."
			/>
		</div>
	);
}
