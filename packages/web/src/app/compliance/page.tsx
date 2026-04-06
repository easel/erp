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

interface ComplianceHold {
  id: string;
  heldTable: string;
  holdReason: string;
  status: string;
  placedAt: string;
  resolvedAt: string | null;
}

export default async function CompliancePage() {
  let holds: ComplianceHold[] = [];
  try {
    const data = await gql<{ complianceHolds: ComplianceHold[] }>(`
      query ComplianceHolds($entityId: String!) {
        complianceHolds(entityId: $entityId) {
          id heldTable holdReason status placedAt resolvedAt
        }
      }
    `, { entityId: ENTITY_ID });
    holds = data.complianceHolds;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Compliance Holds</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        <Link href="/" className="hover:underline">Dashboard</Link>
        {" / "}
        <span>Compliance</span>
        {" / "}
        <span>Holds</span>
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Held Table</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Placed At</TableHead>
            <TableHead>Resolved At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {holds.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            holds.map((hold) => (
              <TableRow key={hold.id}>
                <TableCell className="font-mono">{hold.heldTable}</TableCell>
                <TableCell>{hold.holdReason}</TableCell>
                <TableCell>
                  <Badge
                    variant={hold.status === "RESOLVED" ? "default" : "destructive"}
                  >
                    {hold.status}
                  </Badge>
                </TableCell>
                <TableCell>{hold.placedAt}</TableCell>
                <TableCell>{hold.resolvedAt ?? "--"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
