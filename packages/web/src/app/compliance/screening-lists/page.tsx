import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { gql } from "@/lib/graphql";
import Link from "next/link";

interface ScreeningList {
	id: string;
	code: string;
	name: string;
	sourceAuthority: string;
	isActive: boolean;
}

export default async function ScreeningListsPage() {
	let lists: ScreeningList[] = [];
	try {
		const data = await gql<{ screeningLists: ScreeningList[] }>(`
      query ScreeningLists {
        screeningLists {
          id code name sourceAuthority isActive
        }
      }
    `);
		lists = data.screeningLists;
	} catch {
		// API may be unavailable
	}

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight">Screening Lists</h1>
			<p className="text-sm text-muted-foreground mt-1 mb-6">
				<Link href="/" className="hover:underline">
					Dashboard
				</Link>
				{" / "}
				<Link href="/compliance" className="hover:underline">
					Compliance
				</Link>
				{" / "}
				<span>Screening Lists</span>
			</p>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Code</TableHead>
						<TableHead>Name</TableHead>
						<TableHead>Source Authority</TableHead>
						<TableHead>Status</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{lists.length === 0 ? (
						<TableRow>
							<TableCell colSpan={4} className="text-center text-muted-foreground py-8">
								No data
							</TableCell>
						</TableRow>
					) : (
						lists.map((list) => (
							<TableRow key={list.id}>
								<TableCell className="font-mono">{list.code}</TableCell>
								<TableCell>{list.name}</TableCell>
								<TableCell>{list.sourceAuthority}</TableCell>
								<TableCell>
									<Badge variant={list.isActive ? "default" : "secondary"}>
										{list.isActive ? "Active" : "Inactive"}
									</Badge>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}
