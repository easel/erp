import { ModuleShell } from "@/components/ModuleShell";
import { FINANCE_NAV } from "@/components/ModuleSidebar";

export default function FinanceLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<ModuleShell module="finance" items={FINANCE_NAV}>
			{children}
		</ModuleShell>
	);
}
