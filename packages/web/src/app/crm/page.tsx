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

interface Opportunity {
  id: string;
  name: string;
  pipelineStageId: string;
  amount: number;
  currencyCode: string;
  expectedCloseDate: string;
  probability: number;
}

export default async function CrmPage() {
  let opportunities: Opportunity[] = [];
  try {
    const data = await gql<{ opportunities: Opportunity[] }>(`
      query Opportunities($entityId: String!) {
        opportunities(entityId: $entityId) {
          id name pipelineStageId amount currencyCode expectedCloseDate probability
        }
      }
    `, { entityId: ENTITY_ID });
    opportunities = data.opportunities;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Opportunities</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        <Link href="/" className="hover:underline">Dashboard</Link>
        {" / "}
        <span>CRM</span>
        {" / "}
        <span>Opportunities</span>
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Expected Close</TableHead>
            <TableHead className="text-right">Probability</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {opportunities.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            opportunities.map((opp) => (
              <TableRow key={opp.id}>
                <TableCell className="font-medium">{opp.name}</TableCell>
                <TableCell>{opp.currencyCode}</TableCell>
                <TableCell className="text-right font-mono">
                  {Number(opp.amount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </TableCell>
                <TableCell>{opp.expectedCloseDate}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={opp.probability >= 0.5 ? "default" : "secondary"}>
                    {Math.round(opp.probability * 100)}%
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
