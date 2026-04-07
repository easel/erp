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

interface Currency {
	code: string;
	name: string;
	symbol: string;
	decimalPlaces: number;
	isActive: boolean;
}

export default async function CurrenciesPage() {
	let currencies: Currency[] = [];
	try {
		const data = await gql<{ currencies: Currency[] }>(`
      query Currencies {
        currencies {
          code name symbol decimalPlaces isActive
        }
      }
    `);
		currencies = data.currencies;
	} catch {
		// API may be unavailable
	}

	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight">Currencies</h1>
			<p className="text-sm text-muted-foreground mt-1 mb-6">
				<Link href="/" className="hover:underline">
					Dashboard
				</Link>
				{" / "}
				<Link href="/finance" className="hover:underline">
					Finance
				</Link>
				{" / "}
				<span>Currencies</span>
			</p>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Code</TableHead>
						<TableHead>Name</TableHead>
						<TableHead>Symbol</TableHead>
						<TableHead className="text-right">Decimal Places</TableHead>
						<TableHead>Active</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{currencies.length === 0 ? (
						<TableRow>
							<TableCell colSpan={5} className="text-center text-muted-foreground py-8">
								No data
							</TableCell>
						</TableRow>
					) : (
						currencies.map((currency) => (
							<TableRow key={currency.code}>
								<TableCell className="font-mono">{currency.code}</TableCell>
								<TableCell>{currency.name}</TableCell>
								<TableCell>{currency.symbol}</TableCell>
								<TableCell className="text-right">{currency.decimalPlaces}</TableCell>
								<TableCell>
									<Badge variant={currency.isActive ? "default" : "secondary"}>
										{currency.isActive ? "Active" : "Inactive"}
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
