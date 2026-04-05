import cors from "@fastify/cors";
import type { FastifyError, FastifyInstance } from "fastify";
import Fastify from "fastify";
import { createYoga } from "graphql-yoga";
import { schema } from "./schema.js";

export interface AppOptions {
	/** Allowed CORS origins. Defaults to false (same-origin only). */
	corsOrigin?: string | string[] | boolean;
	/** Log level. Defaults to 'info'. */
	logLevel?: string;
}

/** Consistent error response shape for all 4xx/5xx responses */
interface ErrorResponse {
	statusCode: number;
	error: string;
	message: string;
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
	const { corsOrigin = false, logLevel = "info" } = opts;

	const isTest = process.env["NODE_ENV"] === "test" || logLevel === "silent";

	const app = Fastify({
		logger: isTest
			? false
			: {
					level: logLevel,
				},
	});

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

	// --- GraphQL (Yoga + Pothos) ---
	const yoga = createYoga({
		schema,
		logging: false,
		graphiql: process.env["NODE_ENV"] !== "production",
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
			message:
				statusCode >= 500 ? "An unexpected error occurred" : (error.message ?? "Error"),
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
