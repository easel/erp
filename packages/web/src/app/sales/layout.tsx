import { ModuleShell } from "@/components/ModuleShell";
import { SALES_NAV } from "@/components/ModuleSidebar";

export default function SalesLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<ModuleShell module="sales" items={SALES_NAV}>
			{children}
		</ModuleShell>
	);
}
