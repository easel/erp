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

interface FiscalPeriod {
  id: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  status: string;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "OPEN":
      return "default";
    case "SOFT_CLOSED":
      return "outline";
    case "HARD_CLOSED":
      return "destructive";
    default:
      return "secondary";
  }
}

export default async function FiscalPeriodsPage() {
  let periods: FiscalPeriod[] = [];
  try {
    const data = await gql<{ fiscalPeriods: FiscalPeriod[] }>(`
      query FiscalPeriods($entityId: String!) {
        fiscalPeriods(entityId: $entityId) {
          id periodLabel startDate endDate status
        }
      }
    `, { entityId: ENTITY_ID });
    periods = data.fiscalPeriods;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Fiscal Periods</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        <Link href="/" className="hover:underline">Dashboard</Link>
        {" / "}
        <Link href="/finance" className="hover:underline">Finance</Link>
        {" / "}
        <span>Fiscal Periods</span>
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {periods.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            periods.map((period) => (
              <TableRow key={period.id}>
                <TableCell className="font-medium">{period.periodLabel}</TableCell>
                <TableCell>{period.startDate}</TableCell>
                <TableCell>{period.endDate}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(period.status)}>
                    {period.status}
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
