import { ModuleShell } from "@/components/ModuleShell";
import { COMPLIANCE_NAV } from "@/components/ModuleSidebar";

export default function ComplianceLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<ModuleShell module="compliance" items={COMPLIANCE_NAV}>
			{children}
		</ModuleShell>
	);
}
