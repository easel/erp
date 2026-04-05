/**
 * OpenTelemetry trace context propagation scaffolding.
 *
 * This module provides the minimal structure needed for distributed tracing.
 * A full OTel SDK initialisation (OTLP exporter, BatchSpanProcessor, etc.)
 * can be wired in here once the collector endpoint is available.
 *
 * Usage: call `initTelemetry()` before `buildApp()` in the server entrypoint.
 * The trace context is propagated via the `traceparent` / `tracestate` headers
 * (W3C Trace Context spec) on every inbound request.
 */

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
 * Initialise telemetry.
 *
 * Currently a no-op stub — replace the body with full OTel SDK initialisation
 * when a collector is available:
 *
 * ```ts
 * import { NodeSDK } from '@opentelemetry/sdk-node';
 * import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
 * const sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter() });
 * sdk.start();
 * ```
 */
export function initTelemetry(): void {
	// Stub: OTel SDK initialisation goes here.
	// Trace context is propagated per-request in app.ts via parseTraceparent().
}
