"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useZodForm } from "@/hooks/useZodForm";
import { CreateVendorSchema } from "@apogee/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const ENTITY_ID = "a0000000-0000-0000-0000-000000000001";

export default function NewVendorPage() {
	const router = useRouter();
	const [submitError, setSubmitError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useZodForm(CreateVendorSchema, {
		defaultValues: {
			entityId: ENTITY_ID,
			vendorCode: "",
			legalName: "",
			tradeName: "",
			countryCode: "",
			defaultCurrencyCode: "",
			taxId: "",
			paymentTerms: "",
			riskRating: undefined,
			website: "",
			notes: "",
		},
	});

	async function onSubmit(data: Record<string, unknown>) {
		setSubmitError(null);
		// Strip empty strings from optional fields — Zod expects undefined, not ""
		const cleaned = Object.fromEntries(
			Object.entries(data).filter(([, v]) => v !== "" && v !== undefined),
		);
		try {
			const res = await fetch(`${API_URL}/graphql`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: `mutation CreateVendor($input: CreateVendorInput!) {
            createVendor(input: $input) { id name }
          }`,
					variables: { input: cleaned },
				}),
			});
			const json = await res.json();
			if (json.errors) {
				setSubmitError(json.errors[0].message);
				return;
			}
			router.push("/procurement");
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : "An error occurred");
		}
	}

	return (
		<div className="max-w-2xl">
			<div className="mb-6">
				<h1 className="text-2xl font-bold tracking-tight">New Vendor</h1>
				<p className="text-sm text-muted-foreground mt-1">
					<Link href="/" className="hover:underline">
						Dashboard
					</Link>
					{" / "}
					<Link href="/procurement" className="hover:underline">
						Procurement
					</Link>
					{" / "}
					<span>New Vendor</span>
				</p>
			</div>

			{submitError && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive mb-6">
					{submitError}
				</div>
			)}

			<form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
				<input type="hidden" {...register("entityId")} />

				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label htmlFor="vendorCode">Vendor Code</Label>
						<Input
							id="vendorCode"
							placeholder="VEND-001"
							className="uppercase"
							{...register("vendorCode", {
								onChange: (e) => {
									e.target.value = e.target.value.toUpperCase();
								},
							})}
						/>
						{errors.vendorCode && (
							<p className="text-sm text-destructive">{errors.vendorCode.message}</p>
						)}
					</div>

					<div className="space-y-2">
						<Label htmlFor="legalName">Legal Name</Label>
						<Input id="legalName" placeholder="Acme Corp LLC" {...register("legalName")} />
						{errors.legalName && (
							<p className="text-sm text-destructive">{errors.legalName.message}</p>
						)}
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="tradeName">Trade Name (optional)</Label>
					<Input id="tradeName" placeholder="Acme" {...register("tradeName")} />
					{errors.tradeName && (
						<p className="text-sm text-destructive">{errors.tradeName.message}</p>
					)}
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label htmlFor="countryCode">Country Code</Label>
						<Input
							id="countryCode"
							placeholder="US"
							maxLength={2}
							className="uppercase"
							{...register("countryCode")}
						/>
						{errors.countryCode && (
							<p className="text-sm text-destructive">{errors.countryCode.message}</p>
						)}
					</div>

					<div className="space-y-2">
						<Label htmlFor="defaultCurrencyCode">Currency Code</Label>
						<Input
							id="defaultCurrencyCode"
							placeholder="USD"
							maxLength={3}
							className="uppercase"
							{...register("defaultCurrencyCode")}
						/>
						{errors.defaultCurrencyCode && (
							<p className="text-sm text-destructive">{errors.defaultCurrencyCode.message}</p>
						)}
					</div>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label htmlFor="taxId">Tax ID (optional)</Label>
						<Input id="taxId" placeholder="12-3456789" {...register("taxId")} />
						{errors.taxId && <p className="text-sm text-destructive">{errors.taxId.message}</p>}
					</div>

					<div className="space-y-2">
						<Label htmlFor="paymentTerms">Payment Terms (optional)</Label>
						<Input id="paymentTerms" placeholder="NET30" {...register("paymentTerms")} />
						{errors.paymentTerms && (
							<p className="text-sm text-destructive">{errors.paymentTerms.message}</p>
						)}
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="riskRating">Risk Rating (optional)</Label>
					<select
						id="riskRating"
						className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
						{...register("riskRating", { setValueAs: (v: string) => v || undefined })}
						defaultValue=""
					>
						<option value="">-- Select --</option>
						<option value="LOW">Low</option>
						<option value="MEDIUM">Medium</option>
						<option value="HIGH">High</option>
					</select>
					{errors.riskRating && (
						<p className="text-sm text-destructive">{errors.riskRating.message}</p>
					)}
				</div>

				<div className="space-y-2">
					<Label htmlFor="website">Website (optional)</Label>
					<Input
						id="website"
						type="url"
						placeholder="https://example.com"
						{...register("website", { setValueAs: (v: string) => v || undefined })}
					/>
					{errors.website && <p className="text-sm text-destructive">{errors.website.message}</p>}
				</div>

				<div className="space-y-2">
					<Label htmlFor="notes">Notes (optional)</Label>
					<textarea
						id="notes"
						rows={3}
						className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
						placeholder="Internal notes about this vendor..."
						{...register("notes")}
					/>
					{errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>}
				</div>

				<div className="flex gap-3 pt-2">
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? "Creating..." : "Create Vendor"}
					</Button>
					<Button type="button" variant="outline" onClick={() => router.push("/procurement")}>
						Cancel
					</Button>
				</div>
			</form>
		</div>
	);
}
