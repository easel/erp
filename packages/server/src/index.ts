export const SERVER_VERSION = "0.0.1";

export { buildApp } from "./app.js";
export type { AppOptions } from "./app.js";

// Start the server only when this file is the entrypoint (not when imported as a library).
// Bun sets import.meta.main = true on the entry module; cast through unknown for TS compat
// since @types/bun is not installed.
if ((import.meta as unknown as { main?: boolean }).main === true) {
	const { initTelemetry } = await import("./telemetry.js");
	initTelemetry();

	const { buildApp } = await import("./app.js");

	const port = Number(process.env.PORT ?? 3000);
	const host = process.env.HOST ?? "0.0.0.0";
	const corsOrigin = process.env.CORS_ORIGIN ?? false;
	const logLevel = process.env.LOG_LEVEL ?? "info";

	const app = await buildApp({ corsOrigin: corsOrigin as string | boolean, logLevel });

	try {
		const address = await app.listen({ port, host });
		app.log.info(`Server listening at ${address}`);
	} catch (err) {
		app.log.error(err);
		process.exit(1);
	}
}
