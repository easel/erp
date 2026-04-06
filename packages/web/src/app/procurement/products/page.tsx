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

interface Product {
  id: string;
  productCode: string;
  name: string;
  productType: string;
  unitOfMeasure: string;
  isActive: boolean;
}

export default async function ProductsPage() {
  let products: Product[] = [];
  try {
    const data = await gql<{ products: Product[] }>(`
      query Products($entityId: String!) {
        products(entityId: $entityId) {
          id productCode name productType unitOfMeasure isActive
        }
      }
    `, { entityId: ENTITY_ID });
    products = data.products;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Products</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        <Link href="/" className="hover:underline">Dashboard</Link>
        {" / "}
        <Link href="/procurement" className="hover:underline">Procurement</Link>
        {" / "}
        <span>Products</span>
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>UoM</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-mono">{product.productCode}</TableCell>
                <TableCell>{product.name}</TableCell>
                <TableCell>{product.productType}</TableCell>
                <TableCell>{product.unitOfMeasure}</TableCell>
                <TableCell>
                  <Badge variant={product.isActive ? "default" : "secondary"}>
                    {product.isActive ? "Active" : "Inactive"}
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
