export default function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full bg-compliance" />
        <span>Compliance</span>
      </div>
      {children}
    </div>
  );
}
