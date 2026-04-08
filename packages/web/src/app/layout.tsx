import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { EntityProvider } from "@/lib/entity-context";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
	title: "Apogee ERP",
	description: "Enterprise Resource Planning",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body className={`${inter.variable} font-sans antialiased`}>
				<EntityProvider>
					<AppShell>{children}</AppShell>
				</EntityProvider>
			</body>
		</html>
	);
}
