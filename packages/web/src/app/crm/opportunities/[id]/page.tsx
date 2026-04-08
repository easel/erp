import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { gql } from "@/lib/graphql";
import Link from "next/link";

interface Opportunity {
	id: string;
	name: string;
	pipelineStageId: string;
	amount: number;
	currencyCode: string;
	expectedCloseDate: string;
	probability: number;
	notes: string | null;
	contactId: string | null;
	accountId: string | null;
}

interface Props {
	params: Promise<{ id: string }>;
}

export default async function OpportunityDetailPage({ params }: Props) {
	const { id } = await params;

	let opportunity: Opportunity | null = null;
	try {
		const data = await gql<{ opportunity: Opportunity }>(
			`query Opportunity($id: String!) {
				opportunity(id: $id) {
					id name pipelineStageId amount currencyCode
					expectedCloseDate probability notes contactId accountId
				}
			}`,
			{ id },
		);
		opportunity = data.opportunity;
	} catch {
		// API may be unavailable
	}

	if (!opportunity) {
		return (
			<div>
				<h1 className="text-2xl font-bold tracking-tight mb-2">Opportunity not found</h1>
				<p className="text-sm text-muted-foreground mb-6">
					The opportunity does not exist or could not be loaded.
				</p>
				<Link href="/crm">
					<Button variant="outline">Back to Opportunities</Button>
				</Link>
			</div>
		);
	}

	return (
		<div className="max-w-3xl">
			<div className="flex items-center justify-between mb-6">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">{opportunity.name}</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Expected close: {opportunity.expectedCloseDate}
					</p>
				</div>
				<Link href="/crm">
					<Button variant="outline" size="sm">
						Back to Opportunities
					</Button>
				</Link>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-3">
						Opportunity Details
						<Badge variant={opportunity.probability >= 0.5 ? "default" : "secondary"}>
							{Math.round(opportunity.probability * 100)}% Probability
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
						<div>
							<dt className="text-muted-foreground">Name</dt>
							<dd className="font-medium mt-0.5">{opportunity.name}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Pipeline Stage</dt>
							<dd className="font-medium mt-0.5">{opportunity.pipelineStageId}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Amount</dt>
							<dd className="font-mono font-medium mt-0.5">
								{opportunity.currencyCode}{" "}
								{Number(opportunity.amount).toLocaleString(undefined, {
									minimumFractionDigits: 2,
									maximumFractionDigits: 2,
								})}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Expected Close Date</dt>
							<dd className="font-medium mt-0.5">{opportunity.expectedCloseDate}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Probability</dt>
							<dd className="font-medium mt-0.5">
								{Math.round(opportunity.probability * 100)}%
							</dd>
						</div>
						{opportunity.contactId && (
							<div>
								<dt className="text-muted-foreground">Contact</dt>
								<dd className="font-mono text-xs mt-0.5">{opportunity.contactId}</dd>
							</div>
						)}
						{opportunity.accountId && (
							<div>
								<dt className="text-muted-foreground">Account</dt>
								<dd className="font-mono text-xs mt-0.5">{opportunity.accountId}</dd>
							</div>
						)}
						{opportunity.notes && (
							<div className="col-span-2">
								<dt className="text-muted-foreground">Notes</dt>
								<dd className="mt-0.5">{opportunity.notes}</dd>
							</div>
						)}
					</dl>
				</CardContent>
			</Card>
		</div>
	);
}
