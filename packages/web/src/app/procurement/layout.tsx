export default function ProcurementLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div>
			<div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
				<span className="inline-block h-2 w-2 rounded-full bg-procurement" />
				<span>Procurement</span>
			</div>
			{children}
		</div>
	);
}
