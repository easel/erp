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

interface Account {
  id: string;
  accountNumber: string;
  name: string;
  accountType: string;
  normalBalance: string;
  isHeader: boolean;
  isActive: boolean;
}

export default async function AccountsPage() {
  let accounts: Account[] = [];
  try {
    const data = await gql<{ accounts: Account[] }>(`
      query Accounts($entityId: String!) {
        accounts(entityId: $entityId) {
          id accountNumber name accountType normalBalance isHeader isActive
        }
      }
    `, { entityId: ENTITY_ID });
    accounts = data.accounts;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Chart of Accounts</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        <Link href="/" className="hover:underline">Dashboard</Link>
        {" / "}
        <Link href="/finance" className="hover:underline">Finance</Link>
        {" / "}
        <span>Accounts</span>
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account #</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Normal Balance</TableHead>
            <TableHead>Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            accounts.map((acct) => (
              <TableRow key={acct.id} className={acct.isHeader ? "font-semibold" : ""}>
                <TableCell className="font-mono">{acct.accountNumber}</TableCell>
                <TableCell>{acct.name}</TableCell>
                <TableCell>{acct.accountType}</TableCell>
                <TableCell>{acct.normalBalance}</TableCell>
                <TableCell>
                  <Badge variant={acct.isActive ? "default" : "secondary"}>
                    {acct.isActive ? "Active" : "Inactive"}
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
