"use client";

import { ComplianceStatusBadge } from "@/components/ComplianceStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ComplianceStatus } from "@apogee/shared";
import Link from "next/link";
import React, { useState } from "react";

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
		const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/graphql`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				query: `query ComplianceHold($id: String!) {
					complianceHold(id: $id) {
						id heldTable heldId holdReason status
						placedAt resolvedAt resolvedBy resolutionNotes
					}
				}`,
				variables: { id },
			}),
		});
		const data = await res.json();
		if (!data.errors) {
			hold = data.complianceHold;
		}
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

			{/* Resolution form - only show for ACTIVE holds */}
			{hold.status === "ACTIVE" && <ResolveHoldForm holdId={id} />}

			<div className="mt-6">
				<Link href="/compliance">
					<Button variant="outline">Back to Holds</Button>
				</Link>
			</div>
		</div>
	);
}

// ── Resolution Form Component ───────────────────────────────────────────────

function ResolveHoldForm({ holdId }: { holdId: string }) {
	const [status, setStatus] = useState<"RELEASED" | "REJECTED">("RELEASED");
	const [notes, setNotes] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (status === "RELEASED" && !notes.trim()) {
			setError("Resolution notes are required when releasing a hold");
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/graphql`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: `
						mutation ResolveComplianceHold($input: ResolveComplianceHoldInput!) {
							resolveComplianceHold(input: $input) {
								holdId
								newStatus
							}
						}`,
					variables: {
						input: {
							id: holdId,
							status,
							resolutionNotes: notes || null,
						},
					},
				}),
			});

			const data = await res.json();

			if (data.errors) {
				setError(data.errors[0].message);
			} else {
				// Refresh the page to show updated hold status
				window.location.reload();
			}
		} catch {
			setError("Failed to resolve hold. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle>Resolve Compliance Hold</CardTitle>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium mb-2">
							Resolution Status
						</label>
						<div className="flex gap-4">
							<label className="flex items-center gap-2">
								<input
									type="radio"
									name="status"
									value="RELEASED"
									checked={status === "RELEASED"}
									onChange={(e) => setStatus(e.target.value as "RELEASED" | "REJECTED")}
								/>
								<span>Released</span>
							</label>
							<label className="flex items-center gap-2">
								<input
									type="radio"
									name="status"
									value="REJECTED"
									checked={status === "REJECTED"}
									onChange={(e) => setStatus(e.target.value as "RELEASED" | "REJECTED")}
								/>
								<span>Rejected</span>
							</label>
						</div>
					</div>

					<div>
						<label className="block text-sm font-medium mb-2">
							Resolution Notes
							{status === "RELEASED" && (
								<span className="text-red-500 ml-1">*(required for release)*</span>
							)}
						</label>
						<textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Explain the reason for your decision..."
							className="w-full min-h-[100px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
							maxLength={5000}
						/>
					</div>

					{error && (
						<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
							{error}
						</div>
					)}

					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? "Resolving..." : `Mark as ${status}`}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
