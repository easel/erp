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

interface CountryRestriction {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

export default async function CountryRestrictionsPage() {
  let restrictions: CountryRestriction[] = [];
  try {
    const data = await gql<{ countryRestrictions: CountryRestriction[] }>(`
      query CountryRestrictions($entityId: String!) {
        countryRestrictions(entityId: $entityId) {
          id name description isActive
        }
      }
    `, { entityId: ENTITY_ID });
    restrictions = data.countryRestrictions;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Country Restrictions</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        <Link href="/" className="hover:underline">Dashboard</Link>
        {" / "}
        <Link href="/compliance" className="hover:underline">Compliance</Link>
        {" / "}
        <span>Country Restrictions</span>
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {restrictions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            restrictions.map((restriction) => (
              <TableRow key={restriction.id}>
                <TableCell className="font-medium">{restriction.name}</TableCell>
                <TableCell>{restriction.description}</TableCell>
                <TableCell>
                  <Badge variant={restriction.isActive ? "default" : "secondary"}>
                    {restriction.isActive ? "Active" : "Inactive"}
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
