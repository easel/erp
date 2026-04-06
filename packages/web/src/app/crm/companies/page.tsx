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

const ENTITY_ID = "a0000000-0000-0000-0000-000000000001";

interface CrmCompany {
  id: string;
  name: string;
  domain: string;
  industry: string;
  countryCode: string;
}

export default async function CompaniesPage() {
  let companies: CrmCompany[] = [];
  try {
    const data = await gql<{ crmCompanies: CrmCompany[] }>(`
      query CrmCompanies($entityId: String!) {
        crmCompanies(entityId: $entityId) {
          id name domain industry countryCode
        }
      }
    `, { entityId: ENTITY_ID });
    companies = data.crmCompanies;
  } catch {
    // API may be unavailable
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        <Link href="/" className="hover:underline">Dashboard</Link>
        {" / "}
        <Link href="/crm" className="hover:underline">CRM</Link>
        {" / "}
        <span>Companies</span>
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Domain</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead>Country</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No data
              </TableCell>
            </TableRow>
          ) : (
            companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell>{company.domain}</TableCell>
                <TableCell>{company.industry}</TableCell>
                <TableCell>{company.countryCode}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
