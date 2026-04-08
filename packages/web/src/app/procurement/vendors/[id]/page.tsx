import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { gql } from "@/lib/graphql";
import Link from "next/link";

interface Vendor {
	id: string;
	vendorCode: string;
	legalName: string;
	tradeName: string | null;
	countryCode: string;
	defaultCurrencyCode: string;
	taxId: string | null;
	paymentTerms: string | null;
	riskRating: string | null;
	website: string | null;
	notes: string | null;
	isActive: boolean;
}

interface Props {
	params: Promise<{ id: string }>;
}

export default async function VendorDetailPage({ params }: Props) {
	const { id } = await params;

	let vendor: Vendor | null = null;
	try {
		const data = await gql<{ vendor: Vendor }>(
			`query Vendor($id: String!) {
				vendor(id: $id) {
					id vendorCode legalName tradeName countryCode
					defaultCurrencyCode taxId paymentTerms riskRating
					website notes isActive
				}
			}`,
			{ id },
		);
		vendor = data.vendor;
	} catch {
		// API may be unavailable
	}

	if (!vendor) {
		return (
			<div>
				<h1 className="text-2xl font-bold tracking-tight mb-2">Vendor not found</h1>
				<p className="text-sm text-muted-foreground mb-6">
					The vendor does not exist or could not be loaded.
				</p>
				<Link href="/procurement">
					<Button variant="outline">Back to Vendors</Button>
				</Link>
			</div>
		);
	}

	return (
		<div className="max-w-3xl">
			<div className="flex items-center justify-between mb-6">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">{vendor.legalName}</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{vendor.vendorCode}
						{vendor.tradeName ? ` — ${vendor.tradeName}` : ""}
					</p>
				</div>
				<Link href="/procurement">
					<Button variant="outline" size="sm">
						Back to Vendors
					</Button>
				</Link>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-3">
						Vendor Details
						<Badge variant={vendor.isActive ? "default" : "secondary"}>
							{vendor.isActive ? "Active" : "Inactive"}
						</Badge>
						{vendor.riskRating && (
							<Badge
								variant={
									vendor.riskRating === "HIGH"
										? "destructive"
										: vendor.riskRating === "MEDIUM"
											? "secondary"
											: "default"
								}
							>
								{vendor.riskRating} Risk
							</Badge>
						)}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
						<div>
							<dt className="text-muted-foreground">Vendor Code</dt>
							<dd className="font-mono font-medium mt-0.5">{vendor.vendorCode}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Legal Name</dt>
							<dd className="font-medium mt-0.5">{vendor.legalName}</dd>
						</div>
						{vendor.tradeName && (
							<div>
								<dt className="text-muted-foreground">Trade Name</dt>
								<dd className="font-medium mt-0.5">{vendor.tradeName}</dd>
							</div>
						)}
						<div>
							<dt className="text-muted-foreground">Country</dt>
							<dd className="font-medium mt-0.5">{vendor.countryCode}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Currency</dt>
							<dd className="font-medium mt-0.5">{vendor.defaultCurrencyCode}</dd>
						</div>
						{vendor.taxId && (
							<div>
								<dt className="text-muted-foreground">Tax ID</dt>
								<dd className="font-mono mt-0.5">{vendor.taxId}</dd>
							</div>
						)}
						{vendor.paymentTerms && (
							<div>
								<dt className="text-muted-foreground">Payment Terms</dt>
								<dd className="font-medium mt-0.5">{vendor.paymentTerms}</dd>
							</div>
						)}
						{vendor.website && (
							<div>
								<dt className="text-muted-foreground">Website</dt>
								<dd className="mt-0.5">
									<a
										href={vendor.website}
										target="_blank"
										rel="noopener noreferrer"
										className="text-blue-600 hover:underline"
									>
										{vendor.website}
									</a>
								</dd>
							</div>
						)}
						{vendor.notes && (
							<div className="col-span-2">
								<dt className="text-muted-foreground">Notes</dt>
								<dd className="mt-0.5">{vendor.notes}</dd>
							</div>
						)}
					</dl>
				</CardContent>
			</Card>
		</div>
	);
}
