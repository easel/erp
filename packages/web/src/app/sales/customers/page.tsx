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

interface Customer {
  id: string;
  customerCode: string;
  legalName: string;
  countryCode: string;
  defaultCurrencyCode: string;
  notes: string;
  isActive: boolean;
}

export default async function CustomersPage() {
  let customers: Customer[] = [];
  try {
    const data = await gql<{ customers: Customer[] }>(`
      query Customers($entityId: String!) {
        customers(entityId: $entityId) {
          id customerCode legalName countryCode defaultCurrencyCode notes isActive
        }
      }
    `, { entityId: ENTITY_ID });
    customers = data.customers;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        <Link href="/" className="hover:underline">Dashboard</Link>
        {" / "}
        <Link href="/sales" className="hover:underline">Sales</Link>
        {" / "}
        <span>Customers</span>
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer Code</TableHead>
            <TableHead>Legal Name</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="font-mono">{customer.customerCode}</TableCell>
                <TableCell>{customer.legalName}</TableCell>
                <TableCell>{customer.countryCode}</TableCell>
                <TableCell>{customer.defaultCurrencyCode}</TableCell>
                <TableCell>
                  <Badge variant={customer.isActive ? "default" : "secondary"}>
                    {customer.isActive ? "Active" : "Inactive"}
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
