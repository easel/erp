/**
 * Zod schemas for Goods Receipt entity — shared by Pothos resolvers and React Hook Form.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §5.4 goods_receipt / goods_receipt_line.
 *
 * Layer 1 (structural) validation only. Layer 2 (state-dependent: PO status
 * must be APPROVED/SENT/PARTIALLY_RECEIVED, duplicate receipt_number, AP accrual
 * posting on transition to POSTED) runs server-side.
 *
 * AP accrual on POSTED transition requires WP-2 Finance (implemented in SCM-AP).
 * Barcode scan support: receipt_number and line item barcodes are validated as
 * plain strings here; barcode lookup logic is in the server resolver.
 */
import { z } from "zod";
import { UUIDSchema } from "../schemas.js";

/** NUMERIC(16,4) quantity — positive (> 0) */
const ReceiptQuantitySchema = z
	.string()
	.regex(
		/^\d{1,12}(\.\d{1,4})?$/,
		"Quantity must be a positive number with up to 12 integer digits and 4 decimal places",
	)
	.refine((v) => Number.parseFloat(v) > 0, "Quantity must be greater than zero");

export const GoodsReceiptLineSchema = z
	.object({
		purchaseOrderLineId: UUIDSchema,
		lineNumber: z.number().int().positive("Line number must be a positive integer"),
		quantityReceived: ReceiptQuantitySchema,
		quantityAccepted: ReceiptQuantitySchema,
		quantityRejected: z
			.string()
			.regex(/^\d{1,12}(\.\d{1,4})?$/, "Quantity must be a non-negative number")
			.optional(),
		lotId: UUIDSchema.optional(),
		serialNumberId: UUIDSchema.optional(),
		locationId: UUIDSchema.optional(),
		notes: z.string().max(2000).optional(),
	})
	.refine(
		(data) => {
			// accepted + rejected <= received (Layer 1 check with string comparison)
			const received = Number.parseFloat(data.quantityReceived);
			const accepted = Number.parseFloat(data.quantityAccepted);
			const rejected = Number.parseFloat(data.quantityRejected ?? "0");
			return accepted + rejected <= received;
		},
		{
			message: "Accepted + rejected quantities cannot exceed received quantity",
			path: ["quantityAccepted"],
		},
	);

export type GoodsReceiptLineInput = z.infer<typeof GoodsReceiptLineSchema>;

export const CreateGoodsReceiptSchema = z
	.object({
		entityId: UUIDSchema,
		purchaseOrderId: UUIDSchema,
		receiptNumber: z
			.string()
			.min(1, "Receipt number is required")
			.max(30, "Receipt number must be 30 characters or fewer"),
		receiptDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		locationId: UUIDSchema.optional(),
		notes: z.string().max(5000).optional(),
		lines: z
			.array(GoodsReceiptLineSchema)
			.min(1, "At least one receipt line is required")
			.max(500, "Cannot exceed 500 receipt lines"),
	})
	.refine(
		(data) => {
			// Line numbers must be unique within the receipt
			const lineNumbers = data.lines.map((l) => l.lineNumber);
			return new Set(lineNumbers).size === lineNumbers.length;
		},
		{
			message: "Line numbers must be unique within the goods receipt",
			path: ["lines"],
		},
	);

export type CreateGoodsReceiptInput = z.infer<typeof CreateGoodsReceiptSchema>;

export const PostGoodsReceiptSchema = z.object({
	id: UUIDSchema,
	// AP accrual journal entry reference set by server after WP-2 integration
});

export type PostGoodsReceiptInput = z.infer<typeof PostGoodsReceiptSchema>;
