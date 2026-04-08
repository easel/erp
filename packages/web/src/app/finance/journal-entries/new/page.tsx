"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useZodForm } from "@/hooks/useZodForm";
import { useEntityId } from "@/lib/entity-context";
import { CreateJournalEntrySchema } from "@apogee/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFieldArray } from "react-hook-form";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const FISCAL_PERIOD_ID = "a5000000-0000-0000-0000-000000000004";

const EMPTY_LINE = {
	accountId: "",
	type: "DEBIT" as const,
	amount: "",
	currencyCode: "USD",
	description: "",
};

export default function NewJournalEntryPage() {
	const router = useRouter();
	const { entityId } = useEntityId();
	const [submitError, setSubmitError] = useState<string | null>(null);

	const form = useZodForm(CreateJournalEntrySchema, {
		defaultValues: {
			legalEntityId: entityId,
			fiscalPeriodId: FISCAL_PERIOD_ID,
			entryDate: new Date().toISOString().slice(0, 10),
			reference: "",
			description: "",
			lines: [
				{ ...EMPTY_LINE, type: "DEBIT" },
				{ ...EMPTY_LINE, type: "CREDIT" },
			],
		},
	});

	const {
		register,
		handleSubmit,
		control,
		watch,
		formState: { errors, isSubmitting },
	} = form;

	const { fields, append, remove } = useFieldArray({ control, name: "lines" });

	const watchedLines = watch("lines");
	const { debitTotal, creditTotal } = useMemo(() => {
		let debit = 0;
		let credit = 0;
		for (const line of watchedLines || []) {
			const amt = Number.parseFloat(line.amount) || 0;
			if (line.type === "DEBIT") debit += amt;
			else credit += amt;
		}
		return { debitTotal: debit, creditTotal: credit };
	}, [watchedLines]);

	const isBalanced = Math.abs(debitTotal - creditTotal) < 0.000001;

	async function onSubmit(data: Record<string, unknown>) {
		setSubmitError(null);
		try {
			const res = await fetch(`${API_URL}/graphql`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: `mutation CreateJournalEntry($input: CreateJournalEntryInput!) {
            createJournalEntry(input: $input) { id reference }
          }`,
					variables: { input: data },
				}),
			});
			const json = await res.json();
			if (json.errors) {
				setSubmitError(json.errors[0].message);
				return;
			}
			router.push("/finance");
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : "An error occurred");
		}
	}

	return (
		<div className="max-w-4xl">
			<div className="mb-6">
				<h1 className="text-2xl font-bold tracking-tight">New Journal Entry</h1>
				<p className="text-sm text-muted-foreground mt-1">
					<Link href="/" className="hover:underline">
						Dashboard
					</Link>
					{" / "}
					<Link href="/finance" className="hover:underline">
						Finance
					</Link>
					{" / "}
					<span>New Journal Entry</span>
				</p>
			</div>

			{submitError && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive mb-6">
					{submitError}
				</div>
			)}

			<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
				<input type="hidden" {...register("legalEntityId")} />
				<input type="hidden" {...register("fiscalPeriodId")} />

				<div className="grid grid-cols-3 gap-4">
					<div className="space-y-2">
						<Label htmlFor="reference">Reference</Label>
						<Input id="reference" placeholder="JE-2026-001" {...register("reference")} />
						{errors.reference && (
							<p className="text-sm text-destructive">{errors.reference.message}</p>
						)}
					</div>

					<div className="space-y-2">
						<Label htmlFor="entryDate">Entry Date</Label>
						<Input id="entryDate" type="date" {...register("entryDate")} />
						{errors.entryDate && (
							<p className="text-sm text-destructive">{errors.entryDate.message}</p>
						)}
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">Description</Label>
						<Input id="description" placeholder="Monthly accrual" {...register("description")} />
						{errors.description && (
							<p className="text-sm text-destructive">{errors.description.message}</p>
						)}
					</div>
				</div>

				{/* Line items */}
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold">Line Items</h2>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => append({ ...EMPTY_LINE })}
						>
							Add Line
						</Button>
					</div>

					{errors.lines && !Array.isArray(errors.lines) && (
						<p className="text-sm text-destructive">{errors.lines.message}</p>
					)}
					{errors.lines?.root && (
						<p className="text-sm text-destructive">{errors.lines.root.message}</p>
					)}

					<div className="rounded-md border">
						<div className="grid grid-cols-[1fr_100px_120px_80px_1fr_40px] gap-2 px-3 py-2 bg-muted/50 text-sm font-medium">
							<span>Account ID</span>
							<span>Type</span>
							<span className="text-right">Amount</span>
							<span>Currency</span>
							<span>Description</span>
							<span />
						</div>

						{fields.map((field, index) => (
							<div
								key={field.id}
								className="grid grid-cols-[1fr_100px_120px_80px_1fr_40px] gap-2 px-3 py-2 border-t"
							>
								<div>
									<Input
										placeholder="Account UUID"
										className="font-mono text-xs"
										{...register(`lines.${index}.accountId`)}
									/>
									{errors.lines?.[index]?.accountId && (
										<p className="text-xs text-destructive mt-1">
											{errors.lines[index].accountId.message}
										</p>
									)}
								</div>

								<div>
									<select
										className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
										{...register(`lines.${index}.type`)}
									>
										<option value="DEBIT">Debit</option>
										<option value="CREDIT">Credit</option>
									</select>
								</div>

								<div>
									<Input
										placeholder="0.00"
										className="text-right font-mono"
										{...register(`lines.${index}.amount`)}
									/>
									{errors.lines?.[index]?.amount && (
										<p className="text-xs text-destructive mt-1">
											{errors.lines[index].amount.message}
										</p>
									)}
								</div>

								<div>
									<Input
										placeholder="USD"
										maxLength={3}
										className="uppercase"
										{...register(`lines.${index}.currencyCode`)}
									/>
								</div>

								<div>
									<Input
										placeholder="Line description"
										{...register(`lines.${index}.description`)}
									/>
								</div>

								<div className="flex items-start">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-9 w-9 text-muted-foreground hover:text-destructive"
										onClick={() => fields.length > 2 && remove(index)}
										disabled={fields.length <= 2}
									>
										&times;
									</Button>
								</div>
							</div>
						))}
					</div>

					{/* Totals */}
					<div className="flex justify-end gap-6 text-sm">
						<span>
							Debits: <span className="font-mono font-medium">{debitTotal.toFixed(2)}</span>
						</span>
						<span>
							Credits: <span className="font-mono font-medium">{creditTotal.toFixed(2)}</span>
						</span>
						{!isBalanced && debitTotal + creditTotal > 0 && (
							<span className="text-destructive font-medium">
								Out of balance by {Math.abs(debitTotal - creditTotal).toFixed(2)}
							</span>
						)}
					</div>
				</div>

				<div className="flex gap-3 pt-2">
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? "Creating..." : "Create Entry"}
					</Button>
					<Button type="button" variant="outline" onClick={() => router.push("/finance")}>
						Cancel
					</Button>
				</div>
			</form>
		</div>
	);
}
