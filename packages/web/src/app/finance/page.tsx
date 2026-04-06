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

interface JournalEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  status: string;
  sourceModule: string;
}

export default async function FinancePage() {
  let entries: JournalEntry[] = [];
  try {
    const data = await gql<{ journalEntries: JournalEntry[] }>(`
      query JournalEntries($entityId: String!) {
        journalEntries(entityId: $entityId) {
          id entryNumber entryDate description status sourceModule
        }
      }
    `, { entityId: ENTITY_ID });
    entries = data.journalEntries;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journal Entries</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <Link href="/" className="hover:underline">Dashboard</Link>
            {" / "}
            <span>Finance</span>
            {" / "}
            <span>Journal Entries</span>
          </p>
        </div>
        <Link
          href="/finance/accounts"
          className="text-sm text-finance hover:underline"
        >
          Chart of Accounts
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Entry #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-mono">{entry.entryNumber}</TableCell>
                <TableCell>{entry.entryDate}</TableCell>
                <TableCell>{entry.description}</TableCell>
                <TableCell>{entry.sourceModule}</TableCell>
                <TableCell>
                  <Badge variant={entry.status === "POSTED" ? "default" : "secondary"}>
                    {entry.status}
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
