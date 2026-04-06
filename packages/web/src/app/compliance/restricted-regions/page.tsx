import Link from "next/link";
import { gql } from "@/lib/graphql";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface RestrictedRegion {
  id: string;
  countryCode: string;
  regionName: string;
  sanctionsRegime: string;
  sourceAuthority: string;
}

export default async function RestrictedRegionsPage() {
  let regions: RestrictedRegion[] = [];
  try {
    const data = await gql<{ restrictedRegions: RestrictedRegion[] }>(`
      query RestrictedRegions {
        restrictedRegions {
          id countryCode regionName sanctionsRegime sourceAuthority
        }
      }
    `);
    regions = data.restrictedRegions;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Restricted Regions</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        <Link href="/" className="hover:underline">Dashboard</Link>
        {" / "}
        <Link href="/compliance" className="hover:underline">Compliance</Link>
        {" / "}
        <span>Restricted Regions</span>
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>Sanctions Regime</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {regions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            regions.map((region) => (
              <TableRow key={region.id}>
                <TableCell className="font-mono">{region.countryCode}</TableCell>
                <TableCell>{region.regionName}</TableCell>
                <TableCell>{region.sanctionsRegime}</TableCell>
                <TableCell>{region.sourceAuthority}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
