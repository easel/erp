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

interface Vendor {
  id: string;
  vendorCode: string;
  legalName: string;
  countryCode: string;
  defaultCurrencyCode: string;
  isActive: boolean;
}

export default async function ProcurementPage() {
  let vendors: Vendor[] = [];
  try {
    const data = await gql<{ vendors: Vendor[] }>(`
      query Vendors($entityId: String!) {
        vendors(entityId: $entityId) {
          id vendorCode legalName countryCode defaultCurrencyCode isActive
        }
      }
    `, { entityId: ENTITY_ID });
    vendors = data.vendors;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <Link href="/" className="hover:underline">Dashboard</Link>
            {" / "}
            <span>Procurement</span>
            {" / "}
            <span>Vendors</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/procurement/vendors/new"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90"
          >
            New Vendor
          </Link>
          <Link
            href="/procurement/purchase-orders"
            className="text-sm text-procurement hover:underline"
          >
            Purchase Orders
          </Link>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendor Code</TableHead>
            <TableHead>Legal Name</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendors.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            vendors.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell className="font-mono">{vendor.vendorCode}</TableCell>
                <TableCell>{vendor.legalName}</TableCell>
                <TableCell>{vendor.countryCode}</TableCell>
                <TableCell>{vendor.defaultCurrencyCode}</TableCell>
                <TableCell>
                  <Badge variant={vendor.isActive ? "default" : "secondary"}>
                    {vendor.isActive ? "Active" : "Inactive"}
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
