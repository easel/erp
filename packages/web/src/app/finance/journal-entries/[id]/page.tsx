import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface JournalEntryLine {
	id: string;
	accountId: string;
	type: string;
	amount: string;
	currencyCode: string;
	description: string;
}

interface JournalEntry {
	id: string;
	entryNumber: string;
	entryDate: string;
	description: string;
	reference: string | null;
	status: string;
	sourceModule: string;
	lines: JournalEntryLine[];
}

interface Props {
	params: Promise<{ id: string }>;
}

export default async function JournalEntryDetailPage({ params }: Props) {
	const { id } = await params;

	let entry: JournalEntry | null = null;
	try {
		const data = await gql<{ journalEntry: JournalEntry }>(
			`query JournalEntry($id: String!) {
				journalEntry(id: $id) {
					id entryNumber entryDate description reference status sourceModule
					lines { id accountId type amount currencyCode description }
				}
			}`,
			{ id },
		);
		entry = data.journalEntry;
	} catch {
		// API may be unavailable
	}

	if (!entry) {
		return (
			<div>
				<h1 className="text-2xl font-bold tracking-tight mb-2">Entry not found</h1>
				<p className="text-sm text-muted-foreground mb-6">
					The journal entry does not exist or could not be loaded.
				</p>
				<Link href="/finance">
					<Button variant="outline">Back to Journal Entries</Button>
				</Link>
			</div>
		);
	}

	const debitTotal = entry.lines
		.filter((l) => l.type === "DEBIT")
		.reduce((sum, l) => sum + Number(l.amount), 0);
	const creditTotal = entry.lines
		.filter((l) => l.type === "CREDIT")
		.reduce((sum, l) => sum + Number(l.amount), 0);

	return (
		<div className="max-w-4xl">
			<div className="flex items-center justify-between mb-6">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">{entry.entryNumber}</h1>
					<p className="text-sm text-muted-foreground mt-1">{entry.description}</p>
				</div>
				<Link href="/finance">
					<Button variant="outline" size="sm">
						Back to Journal Entries
					</Button>
				</Link>
			</div>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="flex items-center gap-3">
						Entry Details
						<Badge variant={entry.status === "POSTED" ? "default" : "secondary"}>
							{entry.status}
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
						<div>
							<dt className="text-muted-foreground">Entry Number</dt>
							<dd className="font-mono font-medium mt-0.5">{entry.entryNumber}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Entry Date</dt>
							<dd className="font-medium mt-0.5">{entry.entryDate}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Source Module</dt>
							<dd className="font-medium mt-0.5">{entry.sourceModule}</dd>
						</div>
						{entry.reference && (
							<div>
								<dt className="text-muted-foreground">Reference</dt>
								<dd className="font-mono mt-0.5">{entry.reference}</dd>
							</div>
						)}
					</dl>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Line Items</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					{entry.lines.length === 0 ? (
						<p className="text-sm text-muted-foreground p-6">No line items.</p>
					) : (
						<>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Account</TableHead>
										<TableHead>Type</TableHead>
										<TableHead className="text-right">Amount</TableHead>
										<TableHead>Currency</TableHead>
										<TableHead>Description</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{entry.lines.map((line) => (
										<TableRow key={line.id}>
											<TableCell className="font-mono text-xs">{line.accountId}</TableCell>
											<TableCell>
												<Badge variant={line.type === "DEBIT" ? "default" : "secondary"}>
													{line.type}
												</Badge>
											</TableCell>
											<TableCell className="text-right font-mono">
												{Number(line.amount).toLocaleString(undefined, {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												})}
											</TableCell>
											<TableCell>{line.currencyCode}</TableCell>
											<TableCell>{line.description}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
							<div className="flex justify-end gap-6 text-sm px-4 py-3 border-t bg-muted/30">
								<span>
									Debits:{" "}
									<span className="font-mono font-medium">
										{debitTotal.toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2,
										})}
									</span>
								</span>
								<span>
									Credits:{" "}
									<span className="font-mono font-medium">
										{creditTotal.toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2,
										})}
									</span>
								</span>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
