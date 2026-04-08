import { ComplianceStatusBadge } from "@/components/ComplianceStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { gql } from "@/lib/graphql";
import type { ComplianceStatus } from "@apogee/shared";
import Link from "next/link";

interface ComplianceHold {
	id: string;
	heldTable: string;
	heldId: string;
	holdReason: string;
	status: string;
	placedAt: string;
	resolvedAt: string | null;
	resolvedBy: string | null;
	resolutionNotes: string | null;
}

interface Props {
	params: Promise<{ id: string }>;
}

export default async function ComplianceHoldDetailPage({ params }: Props) {
	const { id } = await params;

	let hold: ComplianceHold | null = null;
	try {
		const data = await gql<{ complianceHold: ComplianceHold }>(
			`query ComplianceHold($id: String!) {
				complianceHold(id: $id) {
					id heldTable heldId holdReason status
					placedAt resolvedAt resolvedBy resolutionNotes
				}
			}`,
			{ id },
		);
		hold = data.complianceHold;
	} catch {
		// API may be unavailable
	}

	if (!hold) {
		return (
			<div>
				<h1 className="text-2xl font-bold tracking-tight mb-2">Hold not found</h1>
				<p className="text-sm text-muted-foreground mb-6">
					The compliance hold does not exist or could not be loaded.
				</p>
				<Link href="/compliance">
					<Button variant="outline">Back to Compliance Holds</Button>
				</Link>
			</div>
		);
	}

	const statusValue = (hold.status.toLowerCase() === "resolved" ? "cleared" : "held") as ComplianceStatus;

	return (
		<div className="max-w-3xl">
			<div className="flex items-center justify-between mb-6">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Compliance Hold</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{hold.heldTable} — {hold.holdReason}
					</p>
				</div>
				<Link href="/compliance">
					<Button variant="outline" size="sm">
						Back to Holds
					</Button>
				</Link>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-3">
						Hold Details
						<ComplianceStatusBadge status={statusValue} />
					</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
						<div>
							<dt className="text-muted-foreground">Held Table</dt>
							<dd className="font-mono font-medium mt-0.5">{hold.heldTable}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Held Record</dt>
							<dd className="font-mono text-xs mt-0.5">{hold.heldId}</dd>
						</div>
						<div className="col-span-2">
							<dt className="text-muted-foreground">Hold Reason</dt>
							<dd className="font-medium mt-0.5">{hold.holdReason}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Status</dt>
							<dd className="font-medium mt-0.5">{hold.status}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Placed At</dt>
							<dd className="font-medium mt-0.5">{hold.placedAt}</dd>
						</div>
						{hold.resolvedAt && (
							<div>
								<dt className="text-muted-foreground">Resolved At</dt>
								<dd className="font-medium mt-0.5">{hold.resolvedAt}</dd>
							</div>
						)}
						{hold.resolvedBy && (
							<div>
								<dt className="text-muted-foreground">Resolved By</dt>
								<dd className="font-mono text-xs mt-0.5">{hold.resolvedBy}</dd>
							</div>
						)}
						{hold.resolutionNotes && (
							<div className="col-span-2">
								<dt className="text-muted-foreground">Resolution Notes</dt>
								<dd className="mt-0.5">{hold.resolutionNotes}</dd>
							</div>
						)}
					</dl>
				</CardContent>
			</Card>
		</div>
	);
}
