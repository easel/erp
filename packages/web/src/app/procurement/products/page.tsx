"use client";

import { ListTable } from "@/components/ListTable";
import { Badge } from "@/components/ui/badge";
import { useEntityId } from "@/lib/entity-context";
import { gql } from "@/lib/graphql";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface Product {
	id: string;
	productCode: string;
	name: string;
	productType: string;
	unitOfMeasure: string;
	isActive: boolean;
}

const columns: ColumnDef<Product & Record<string, unknown>>[] = [
	{ accessorKey: "productCode", header: "Product Code" },
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "productType", header: "Type" },
	{ accessorKey: "unitOfMeasure", header: "UoM" },
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

export default function ProductsPage() {
	const { entityId } = useEntityId();
	const [products, setProducts] = useState<Product[]>([]);

	useEffect(() => {
		gql<{ products: Product[] }>(
			`query Products($entityId: String!) {
				products(entityId: $entityId) {
					id productCode name productType unitOfMeasure isActive
				}
			}`,
			{ entityId },
		)
			.then((data) => setProducts(data.products))
			.catch(() => {});
	}, [entityId]);

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Products</h1>
			<ListTable
				columns={columns}
				data={products as (Product & Record<string, unknown>)[]}
				exportFilename="products"
				emptyMessage="No products found."
			/>
		</div>
	);
}
