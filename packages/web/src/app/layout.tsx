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
  { name: "Dashboard", href: "/", color: "text-foreground" },
  { name: "Finance", href: "/finance", color: "text-finance" },
  { name: "Sales", href: "/sales", color: "text-sales" },
  { name: "Procurement", href: "/procurement", color: "text-procurement" },
  { name: "CRM", href: "/crm", color: "text-crm" },
  { name: "Compliance", href: "/compliance", color: "text-compliance" },
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
                <Link
                  key={mod.href}
                  href={mod.href}
                  className={`block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent transition-colors ${mod.color}`}
                >
                  {mod.name}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Main area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="h-14 shrink-0 border-b flex items-center justify-between px-6 bg-background">
              <span className="text-sm font-semibold text-muted-foreground">
                Apogee ERP
              </span>
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
