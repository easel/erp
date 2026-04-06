import Link from "next/link";
import { gql } from "@/lib/graphql";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

const ENTITY_ID = "a0000000-0000-0000-0000-000000000001";

interface SalesOrder {
  id: string;
  orderNumber: string;
  status: string;
  complianceStatus: string;
  currencyCode: string;
  totalAmount: number;
}

export default async function SalesPage() {
  let orders: SalesOrder[] = [];
  try {
    const data = await gql<{ salesOrders: SalesOrder[] }>(`
      query SalesOrders($entityId: String!) {
        salesOrders(entityId: $entityId) {
          id orderNumber status complianceStatus currencyCode totalAmount
        }
      }
    `, { entityId: ENTITY_ID });
    orders = data.salesOrders;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Sales Orders</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        <Link href="/" className="hover:underline">Dashboard</Link>
        {" / "}
        <span>Sales</span>
        {" / "}
        <span>Orders</span>
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order #</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Compliance</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead className="text-right">Total Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-mono">{order.orderNumber}</TableCell>
                <TableCell>
                  <Badge variant={order.status === "CONFIRMED" ? "default" : "secondary"}>
                    {order.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={order.complianceStatus === "CLEAR" ? "default" : "destructive"}
                  >
                    {order.complianceStatus}
                  </Badge>
                </TableCell>
                <TableCell>{order.currencyCode}</TableCell>
                <TableCell className="text-right font-mono">
                  {Number(order.totalAmount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
