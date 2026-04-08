import { ModuleShell } from "@/components/ModuleShell";
import { SETTINGS_NAV } from "@/components/ModuleSidebar";

export default function SettingsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<ModuleShell module="settings" items={SETTINGS_NAV}>
			{children}
		</ModuleShell>
	);
}
