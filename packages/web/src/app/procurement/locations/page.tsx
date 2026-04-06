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

interface InventoryLocation {
  id: string;
  locationCode: string;
  name: string;
  isActive: boolean;
}

export default async function LocationsPage() {
  let locations: InventoryLocation[] = [];
  try {
    const data = await gql<{ inventoryLocations: InventoryLocation[] }>(`
      query InventoryLocations($entityId: String!) {
        inventoryLocations(entityId: $entityId) {
          id locationCode name isActive
        }
      }
    `, { entityId: ENTITY_ID });
    locations = data.inventoryLocations;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Inventory Locations</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        <Link href="/" className="hover:underline">Dashboard</Link>
        {" / "}
        <Link href="/procurement" className="hover:underline">Procurement</Link>
        {" / "}
        <span>Locations</span>
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Location Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            locations.map((location) => (
              <TableRow key={location.id}>
                <TableCell className="font-mono">{location.locationCode}</TableCell>
                <TableCell>{location.name}</TableCell>
                <TableCell>
                  <Badge variant={location.isActive ? "default" : "secondary"}>
                    {location.isActive ? "Active" : "Inactive"}
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
