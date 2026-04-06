import Link from "next/link";
import { gql } from "@/lib/graphql";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

const ENTITY_ID = "a0000000-0000-0000-0000-000000000001";

interface DashboardData {
  _version: string;
  legalEntities: { id: string }[];
  vendors: { id: string }[];
  customers: { id: string }[];
  products: { id: string }[];
  accounts: { id: string }[];
  salesOrders: { id: string }[];
  purchaseOrders: { id: string }[];
  journalEntries: { id: string }[];
  opportunities: { id: string }[];
  complianceHolds: { id: string }[];
}

export default async function DashboardPage() {
  let data: DashboardData | null = null;
  try {
    data = await gql<DashboardData>(`
      query Dashboard($entityId: String!) {
        _version
        legalEntities { id }
        vendors(entityId: $entityId) { id }
        customers(entityId: $entityId) { id }
        products(entityId: $entityId) { id }
        accounts(entityId: $entityId) { id }
        salesOrders(entityId: $entityId) { id }
        purchaseOrders(entityId: $entityId) { id }
        journalEntries(entityId: $entityId) { id }
        opportunities(entityId: $entityId) { id }
        complianceHolds(entityId: $entityId) { id }
      }
    `, { entityId: ENTITY_ID });
  } catch {
    // API may be unavailable
  }

  const cards = [
    { label: "Legal Entities", count: data?.legalEntities?.length ?? 0, href: "/", color: "border-l-foreground" },
    { label: "Journal Entries", count: data?.journalEntries?.length ?? 0, href: "/finance", color: "border-l-finance" },
    { label: "Accounts", count: data?.accounts?.length ?? 0, href: "/finance/accounts", color: "border-l-finance" },
    { label: "Sales Orders", count: data?.salesOrders?.length ?? 0, href: "/sales", color: "border-l-sales" },
    { label: "Customers", count: data?.customers?.length ?? 0, href: "/sales", color: "border-l-sales" },
    { label: "Vendors", count: data?.vendors?.length ?? 0, href: "/procurement", color: "border-l-procurement" },
    { label: "Purchase Orders", count: data?.purchaseOrders?.length ?? 0, href: "/procurement/purchase-orders", color: "border-l-procurement" },
    { label: "Products", count: data?.products?.length ?? 0, href: "/procurement", color: "border-l-procurement" },
    { label: "Opportunities", count: data?.opportunities?.length ?? 0, href: "/crm", color: "border-l-crm" },
    { label: "Compliance Holds", count: data?.complianceHolds?.length ?? 0, href: "/compliance", color: "border-l-compliance" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-6">
        System version: {data?._version ?? "unavailable"}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className={`border-l-4 ${card.color} hover:shadow-md transition-shadow`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{card.count}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
