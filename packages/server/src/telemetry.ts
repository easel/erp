/**
 * OpenTelemetry trace context propagation and SDK initialisation.
 *
 * Call `initTelemetry()` before `buildApp()` in the server entrypoint.
 * The trace context is propagated via the `traceparent` / `tracestate` headers
 * (W3C Trace Context spec) on every inbound request.
 *
 * SDK initialisation is skipped when OTEL_ENDPOINT is not set, making the
 * module safe to import in unit tests without side-effects.
 */

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

/** Minimal span-context shape — matches @opentelemetry/api SpanContext. */
export interface SpanContext {
	traceId: string;
	spanId: string;
	traceFlags: number;
}

/** Parse a W3C `traceparent` header into a SpanContext, or return null. */
export function parseTraceparent(header: string | undefined): SpanContext | null {
	if (!header) return null;
	// Format: 00-<traceId:32hex>-<spanId:16hex>-<flags:2hex>
	const parts = header.split("-");
	if (parts.length !== 4 || parts[0] !== "00") return null;
	const [, traceId, spanId, flags] = parts;
	if (!traceId || traceId.length !== 32) return null;
	if (!spanId || spanId.length !== 16) return null;
	return { traceId, spanId, traceFlags: Number.parseInt(flags ?? "00", 16) };
}

/** Generate a random 16-byte hex trace ID. */
export function generateTraceId(): string {
	return Array.from({ length: 16 }, () =>
		Math.floor(Math.random() * 256)
			.toString(16)
			.padStart(2, "0"),
	).join("");
}

/** Generate a random 8-byte hex span ID. */
export function generateSpanId(): string {
	return Array.from({ length: 8 }, () =>
		Math.floor(Math.random() * 256)
			.toString(16)
			.padStart(2, "0"),
	).join("");
}

/**
 * Initialise the OpenTelemetry SDK.
 *
 * Reads OTEL_ENDPOINT from the environment. When the variable is absent or
 * empty, this function is a no-op so unit tests and development environments
 * without a collector work without side-effects.
 *
 * The SDK is configured with:
 * - OTLPTraceExporter pointing at OTEL_ENDPOINT
 * - BatchSpanProcessor (bundled inside NodeSDK by default)
 * - Automatic process shutdown on SIGTERM via sdk.shutdown()
 */
export function initTelemetry(): void {
	const endpoint = process.env.OTEL_ENDPOINT;
	if (!endpoint) {
		// No-op when collector endpoint is not configured.
		return;
	}

	const traceExporter = new OTLPTraceExporter({ url: endpoint });
	const sdk = new NodeSDK({ traceExporter });

	sdk.start();

	// Flush and shut down the SDK on process exit so spans are not lost.
	process.on("SIGTERM", () => {
		sdk.shutdown().catch(() => {
			// Best-effort shutdown — ignore errors on exit.
		});
	});
}
