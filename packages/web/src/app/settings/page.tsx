import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

const sections = [
	{
		title: "Legal Entities",
		description: "Manage legal entities, subsidiaries, and their configurations",
		href: "/settings/entities",
	},
	{
		title: "Users & Roles",
		description: "User accounts, role assignments, and access policies",
		href: "/settings/users",
	},
	{
		title: "Workflows",
		description: "Approval workflows, routing rules, and automation",
		href: "/settings/workflows",
	},
	{
		title: "Integrations",
		description: "External system connections and API configurations",
		href: "/settings/integrations",
	},
	{
		title: "Audit Log",
		description: "System-wide audit trail and change history",
		href: "/settings/audit",
	},
];

export default function SettingsPage() {
	return (
		<div>
			<h1 className="text-2xl font-bold tracking-tight mb-6">Settings</h1>

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{sections.map((section) => (
					<Link key={section.href} href={section.href}>
						<Card className="hover:shadow-md transition-shadow h-full">
							<CardHeader className="pb-2">
								<CardTitle className="text-base">{section.title}</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">{section.description}</p>
							</CardContent>
						</Card>
					</Link>
				))}
			</div>
		</div>
	);
}
