import { ModuleShell } from "@/components/ModuleShell";
import { PROCUREMENT_NAV } from "@/components/ModuleSidebar";

export default function ProcurementLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<ModuleShell module="procurement" items={PROCUREMENT_NAV}>
			{children}
		</ModuleShell>
	);
}
