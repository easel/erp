import { ModuleShell } from "@/components/ModuleShell";
import { CRM_NAV } from "@/components/ModuleSidebar";

export default function CrmLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<ModuleShell module="crm" items={CRM_NAV}>
			{children}
		</ModuleShell>
	);
}
