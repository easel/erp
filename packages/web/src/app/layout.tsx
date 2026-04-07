import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
	title: "Apogee ERP",
	description: "Enterprise Resource Planning",
};

const modules = [
	{ name: "Dashboard", href: "/", color: "text-foreground", children: [] },
	{
		name: "Finance",
		href: "/finance",
		color: "text-finance",
		children: [
			{ name: "Accounts", href: "/finance/accounts" },
			{ name: "Fiscal Periods", href: "/finance/fiscal-periods" },
			{ name: "Currencies", href: "/finance/currencies" },
		],
	},
	{
		name: "Sales",
		href: "/sales",
		color: "text-sales",
		children: [{ name: "Customers", href: "/sales/customers" }],
	},
	{
		name: "Procurement",
		href: "/procurement",
		color: "text-procurement",
		children: [
			{ name: "Purchase Orders", href: "/procurement/purchase-orders" },
			{ name: "Products", href: "/procurement/products" },
			{ name: "Locations", href: "/procurement/locations" },
		],
	},
	{
		name: "CRM",
		href: "/crm",
		color: "text-crm",
		children: [
			{ name: "Companies", href: "/crm/companies" },
			{ name: "Contacts", href: "/crm/contacts" },
		],
	},
	{
		name: "Compliance",
		href: "/compliance",
		color: "text-compliance",
		children: [
			{ name: "Screening Lists", href: "/compliance/screening-lists" },
			{ name: "Country Restrictions", href: "/compliance/country-restrictions" },
			{ name: "Restricted Regions", href: "/compliance/restricted-regions" },
		],
	},
];

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body className={`${inter.variable} font-sans antialiased`}>
				<div className="flex h-screen">
					{/* Sidebar */}
					<aside className="w-56 shrink-0 border-r bg-muted/30 flex flex-col">
						<div className="p-4 border-b">
							<h2 className="text-lg font-bold tracking-tight">Apogee ERP</h2>
						</div>
						<nav className="flex-1 p-3 space-y-1">
							{modules.map((mod) => (
								<div key={mod.href}>
									<Link
										href={mod.href}
										className={`block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent transition-colors ${mod.color}`}
									>
										{mod.name}
									</Link>
									{mod.children.length > 0 && (
										<div className="space-y-0.5">
											{mod.children.map((child) => (
												<Link
													key={child.href}
													href={child.href}
													className="block rounded-md pl-6 pr-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
												>
													{child.name}
												</Link>
											))}
										</div>
									)}
								</div>
							))}
						</nav>
					</aside>

					{/* Main area */}
					<div className="flex-1 flex flex-col overflow-hidden">
						{/* Header */}
						<header className="h-14 shrink-0 border-b flex items-center justify-between px-6 bg-background">
							<span className="text-sm font-semibold text-muted-foreground">Apogee ERP</span>
							<span className="text-sm text-muted-foreground border rounded-md px-3 py-1">
								ODC-US
							</span>
						</header>

						{/* Page content */}
						<main className="flex-1 overflow-y-auto p-6">{children}</main>
					</div>
				</div>
			</body>
		</html>
	);
}
