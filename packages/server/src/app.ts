import cors from "@fastify/cors";
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import Fastify from "fastify";
import { createYoga } from "graphql-yoga";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { registerAuthHook } from "./auth.js";
import { schema } from "./schema.js";
import { generateSpanId, generateTraceId, parseTraceparent } from "./telemetry.js";

export interface AppOptions {
	/** Allowed CORS origins. Defaults to false (same-origin only). */
	corsOrigin?: string | string[] | boolean;
	/** Log level. Defaults to 'info'. */
	logLevel?: string;
	/**
	 * Prometheus registry to use. Defaults to a new per-instance registry so
	 * that parallel test runs do not share metrics state.
	 */
	metricsRegistry?: Registry;
	/**
	 * JWT secret for HS256 token validation.  When set, an onRequest hook
	 * enforces Bearer JWT authentication on all non-bypass routes.
	 * Reads APP_JWT_SECRET from the environment if not supplied explicitly.
	 * Pass an empty string to explicitly disable auth (e.g. in unit tests
	 * that don't exercise the auth layer).
	 */
	authSecret?: string;
}

/** Consistent error response shape for all 4xx/5xx responses */
interface ErrorResponse {
	statusCode: number;
	error: string;
	message: string;
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
	const { corsOrigin = false, logLevel = "info" } = opts;
	// Resolve auth secret: explicit option > env var > disabled
	const authSecret =
		opts.authSecret !== undefined ? opts.authSecret : (process.env.APP_JWT_SECRET ?? "");

	const isTest = process.env.NODE_ENV === "test" || logLevel === "silent";

	// ------------------------------------------------------------------ //
	// Prometheus metrics registry
	// ------------------------------------------------------------------ //
	const registry = opts.metricsRegistry ?? new Registry();
	collectDefaultMetrics({ register: registry });

	const httpRequestsTotal = new Counter({
		name: "http_requests_total",
		help: "Total number of HTTP requests",
		labelNames: ["method", "route", "status_code"],
		registers: [registry],
	});

	const httpRequestDurationSeconds = new Histogram({
		name: "http_request_duration_seconds",
		help: "Duration of HTTP requests in seconds",
		labelNames: ["method", "route", "status_code"],
		buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
		registers: [registry],
	});

	// ------------------------------------------------------------------ //
	// Fastify — structured JSON logging with request ID propagation
	// Fastify uses pino under the hood; pino emits JSON by default.
	// The `genReqId` function stamps every request with a stable ID that
	// pino binds to every log line for that request lifecycle.
	// ------------------------------------------------------------------ //
	let reqCounter = 0;
	const app = Fastify({
		logger: isTest
			? false
			: {
					level: logLevel,
					// Ensure pino emits plain JSON (no pretty-print in production).
					// In development callers may pipe through `pino-pretty` externally.
					formatters: {
						level(label) {
							return { level: label };
						},
					},
				},
		// Generate a short, deterministic request ID included in every log line.
		genReqId(_req) {
			reqCounter += 1;
			return `req-${reqCounter.toString().padStart(6, "0")}`;
		},
		// Propagate request ID to response header so callers can correlate logs.
		requestIdHeader: "x-request-id",
		requestIdLogLabel: "requestId",
	});

	// ------------------------------------------------------------------ //
	// Echo request ID back in the response so callers can correlate logs.
	// ------------------------------------------------------------------ //
	app.addHook("onSend", async (req: FastifyRequest, reply: FastifyReply) => {
		reply.header("x-request-id", req.id);
	});

	// ------------------------------------------------------------------ //
	// OTel trace context — extract / generate per request
	// ------------------------------------------------------------------ //
	app.addHook("onRequest", async (req: FastifyRequest, _reply: FastifyReply) => {
		const traceparent = req.headers.traceparent as string | undefined;
		const ctx = parseTraceparent(traceparent) ?? {
			traceId: generateTraceId(),
			spanId: generateSpanId(),
			traceFlags: 1,
		};
		// Bind trace IDs to the request log so they appear on every log line.
		req.log.child({ traceId: ctx.traceId, spanId: ctx.spanId });
	});

	// ------------------------------------------------------------------ //
	// Prometheus timing hook
	// ------------------------------------------------------------------ //
	app.addHook("onResponse", async (req: FastifyRequest, reply: FastifyReply) => {
		const route = req.routeOptions?.url ?? req.url;
		// Skip the /metrics endpoint itself to avoid cardinality feedback loops.
		if (route === "/metrics") return;
		const labels = {
			method: req.method,
			route,
			status_code: String(reply.statusCode),
		};
		httpRequestsTotal.inc(labels);
		const elapsed = reply.elapsedTime / 1000; // ms → seconds
		httpRequestDurationSeconds.observe(labels, elapsed);
	});

	// --- Auth ---
	if (authSecret) {
		registerAuthHook(app, { secret: authSecret });
	}

	// --- CORS ---
	await app.register(cors, {
		origin: corsOrigin,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	});

	// --- Health endpoints ---
	app.get("/health/live", async (_req, reply) => {
		return reply.status(200).send({ status: "ok" });
	});

	app.get("/health/ready", async (_req, reply) => {
		return reply.status(200).send({ status: "ok" });
	});

	// --- Prometheus metrics endpoint ---
	app.get("/metrics", async (_req, reply) => {
		const metrics = await registry.metrics();
		return reply.status(200).header("Content-Type", registry.contentType).send(metrics);
	});

	// --- GraphQL (Yoga + Pothos) ---
	const yoga = createYoga({
		schema,
		logging: false,
		graphiql: process.env.NODE_ENV !== "production",
	});

	// Mount GraphQL Yoga as a content-type-aware handler
	app.route({
		url: "/graphql",
		method: ["GET", "POST", "OPTIONS"],
		handler: async (req, reply) => {
			const response = await yoga.handleNodeRequestAndResponse(req.raw, reply.raw, {});
			reply.hijack();
			return response;
		},
	});

	// --- Global error handler ---
	app.setErrorHandler((error: FastifyError, _req, reply) => {
		const statusCode = error.statusCode ?? 500;
		const body: ErrorResponse = {
			statusCode,
			error: statusCode >= 500 ? "Internal Server Error" : (error.name ?? "Error"),
			message: statusCode >= 500 ? "An unexpected error occurred" : (error.message ?? "Error"),
		};

		if (statusCode >= 500) {
			app.log.error({ err: error }, "Unhandled server error");
		} else {
			app.log.warn({ err: error }, "Client error");
		}

		return reply.status(statusCode).send(body);
	});

	// --- 404 handler ---
	app.setNotFoundHandler((_req, reply) => {
		const body: ErrorResponse = {
			statusCode: 404,
			error: "Not Found",
			message: "Route not found",
		};
		return reply.status(404).send(body);
	});

	return app;
}
