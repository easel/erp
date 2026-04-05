/**
 * useZodForm — React Hook Form configured with Zod resolver.
 *
 * Standard form hook for all Apogee forms per ADR-010 §Form Library Integration.
 * Accepts a Zod schema from @apogee/shared; infers the output type, so changing
 * the schema causes a compile error in any form that doesn't handle the change.
 *
 * Usage:
 *   const form = useZodForm(CreateVendorSchema);
 *   // form is UseFormReturn<CreateVendorInput>
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { FieldValues, UseFormProps, UseFormReturn } from "react-hook-form";

/**
 * Schema shape accepted by zodResolver — covers both Zod v3-compat and Zod v4
 * schemas as exposed by the @hookform/resolvers overloads.
 * Using the minimal structural type to avoid internals drift.
 */
interface ZodLike<TOutput extends FieldValues, TInput = TOutput> {
	readonly _output: TOutput;
	readonly _input: TInput;
	// biome-ignore lint/suspicious/noExplicitAny: structural compatibility with Zod internals
	readonly _def: any;
	// biome-ignore lint/suspicious/noExplicitAny: structural compatibility with Zod internals
	readonly _zod?: any;
	safeParse(data: unknown): { success: boolean; data?: TOutput; error?: unknown };
}

/**
 * Thin wrapper wiring React Hook Form to a Zod schema.
 * The return type is inferred from the schema's output type.
 *
 * @param schema  A Zod schema from @apogee/shared (e.g. CreateVendorSchema).
 *                Changing a field in the schema causes a TS error in any
 *                useZodForm call that passes a stale defaultValues shape.
 * @param options Optional React Hook Form config (defaultValues, mode, etc.)
 */
export function useZodForm<TOutput extends FieldValues>(
	schema: ZodLike<TOutput>,
	options?: Omit<UseFormProps<TOutput>, "resolver">,
): UseFormReturn<TOutput> {
	return useForm<TOutput>({
		// biome-ignore lint/suspicious/noExplicitAny: bridge between Zod v4 types and hookform/resolvers overloads
		resolver: zodResolver(schema as unknown as Parameters<typeof zodResolver>[0]) as any,
		mode: "onBlur",
		...options,
	});
}
