import { ComplianceStatusBadge } from "@/components/ComplianceStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gql } from "@/lib/graphql";
import type { ComplianceStatus } from "@apogee/shared";
import Link from "next/link";

interface SalesOrderLine {
	id: string;
	lineNumber: number;
	productId: string | null;
	description: string;
	quantityOrdered: string;
	unitPrice: string;
	amount: string;
	currencyCode: string;
}

interface SalesOrder {
	id: string;
	orderNumber: string;
	orderDate: string;
	status: string;
	complianceStatus: string | null;
	currencyCode: string;
	totalAmount: string;
	notes: string | null;
	customerId: string;
	lines: SalesOrderLine[];
}

interface Props {
	params: Promise<{ id: string }>;
}

export default async function SalesOrderDetailPage({ params }: Props) {
	const { id } = await params;

	let order: SalesOrder | null = null;
	try {
		const data = await gql<{ salesOrder: SalesOrder }>(
			`
      query SalesOrder($id: String!) {
        salesOrder(id: $id) {
          id orderNumber orderDate status complianceStatus
          currencyCode totalAmount notes customerId
          lines {
            id lineNumber productId description
            quantityOrdered unitPrice amount currencyCode
          }
        }
      }
    `,
			{ id },
		);
		order = data.salesOrder;
	} catch {
		// API may be unavailable or order not found
	}

	if (!order) {
		return (
			<div>
				<h1 className="text-2xl font-bold tracking-tight mb-2">Order not found</h1>
				<p className="text-sm text-muted-foreground mb-6">
					The sales order you are looking for does not exist or could not be loaded.
				</p>
				<Link href="/sales">
					<Button variant="outline">Back to Orders</Button>
				</Link>
			</div>
		);
	}

	const complianceStatus = (order.complianceStatus?.toLowerCase() ?? "pending") as ComplianceStatus;

	return (
		<div className="max-w-4xl">
			<div className="mb-6">
				<p className="text-sm text-muted-foreground mb-1">
					<Link href="/" className="hover:underline">
						Dashboard
					</Link>
					{" / "}
					<Link href="/sales" className="hover:underline">
						Sales
					</Link>
					{" / "}
					<span>{order.orderNumber}</span>
				</p>
				<div className="flex items-center justify-between">
					<h1 className="text-2xl font-bold tracking-tight">{order.orderNumber}</h1>
					<Link href="/sales">
						<Button variant="outline" size="sm">
							Back to Orders
						</Button>
					</Link>
				</div>
			</div>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="flex items-center gap-3">
						Order Details
						<Badge variant={order.status === "CONFIRMED" ? "default" : "secondary"}>
							{order.status}
						</Badge>
						<ComplianceStatusBadge status={complianceStatus} />
					</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
						<div>
							<dt className="text-muted-foreground">Order Number</dt>
							<dd className="font-mono font-medium mt-0.5">{order.orderNumber}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Order Date</dt>
							<dd className="font-medium mt-0.5">{order.orderDate}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Customer ID</dt>
							<dd className="font-mono text-xs mt-0.5">{order.customerId}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Currency</dt>
							<dd className="font-medium mt-0.5">{order.currencyCode}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Total Amount</dt>
							<dd className="font-mono font-medium mt-0.5">
								{Number(order.totalAmount).toLocaleString(undefined, {
									minimumFractionDigits: 2,
									maximumFractionDigits: 2,
								})}
							</dd>
						</div>
						{order.notes && (
							<div className="col-span-2">
								<dt className="text-muted-foreground">Notes</dt>
								<dd className="mt-0.5">{order.notes}</dd>
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
					{order.lines.length === 0 ? (
						<p className="text-sm text-muted-foreground p-6">No line items found.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-12">#</TableHead>
									<TableHead>Description</TableHead>
									<TableHead className="text-right">Qty</TableHead>
									<TableHead className="text-right">Unit Price</TableHead>
									<TableHead className="text-right">Amount</TableHead>
									<TableHead>Currency</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{order.lines.map((line) => (
									<TableRow key={line.id}>
										<TableCell className="font-mono text-xs">{line.lineNumber}</TableCell>
										<TableCell>{line.description}</TableCell>
										<TableCell className="text-right font-mono">
											{Number(line.quantityOrdered).toLocaleString()}
										</TableCell>
										<TableCell className="text-right font-mono">
											{Number(line.unitPrice).toLocaleString(undefined, {
												minimumFractionDigits: 2,
												maximumFractionDigits: 2,
											})}
										</TableCell>
										<TableCell className="text-right font-mono">
											{Number(line.amount).toLocaleString(undefined, {
												minimumFractionDigits: 2,
												maximumFractionDigits: 2,
											})}
										</TableCell>
										<TableCell>{line.currencyCode}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
