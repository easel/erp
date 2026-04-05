#!/usr/bin/env bun
/**
 * Apogee Demo Mode
 *
 * Stands up the full stack for demonstration and functional testing:
 *   1. Start PostgreSQL and Redis via Docker Compose
 *   2. Wait for PostgreSQL to be healthy
 *   3. Run database migrations (graphile-migrate)
 *   4. Seed the database with Orbital Dynamics Corp demo dataset
 *   5. Start the API server
 *   6. Open the browser at http://localhost:3000
 *
 * Requirements: docker, bun
 *
 * Ref: FEAT-009 PLT-020, issue erp-b2ef3933
 */

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const SERVER_DIR = path.join(ROOT, "packages", "server");
const SERVER_PORT = Number(process.env.PORT ?? 3000);
const DATABASE_URL =
	process.env.DATABASE_URL ?? "postgresql://apogee:apogee_dev@localhost:5432/apogee_dev";
const BROWSER_URL = `http://localhost:${SERVER_PORT}`;

// ─── Colour helpers ────────────────────────────────────────────────────────────
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function log(msg: string) {
	console.log(`${CYAN}[demo]${RESET} ${msg}`);
}
function ok(msg: string) {
	console.log(`${GREEN}[demo]${RESET} ${BOLD}${msg}${RESET}`);
}
function warn(msg: string) {
	console.log(`${YELLOW}[demo]${RESET} ${msg}`);
}
function die(msg: string): never {
	console.error(`${RED}[demo] ERROR:${RESET} ${msg}`);
	process.exit(1);
}

// ─── Prerequisite checks ───────────────────────────────────────────────────────
function checkPrerequisites() {
	log("Checking prerequisites…");

	for (const cmd of ["docker", "bun"]) {
		const result = spawnSync(cmd, ["--version"], { stdio: "pipe" });
		if (result.status !== 0) {
			die(`Required tool not found: ${cmd}\nPlease install it and try again.`);
		}
	}

	// Check docker daemon is running
	const dockerInfo = spawnSync("docker", ["info"], { stdio: "pipe" });
	if (dockerInfo.status !== 0) {
		die(
			"Docker daemon is not running.\nPlease start Docker Desktop or the Docker daemon and try again.",
		);
	}

	ok("Prerequisites OK (docker, bun)");
}

// ─── Docker Compose helpers ────────────────────────────────────────────────────
function dockerCompose(args: string[], opts?: { cwd?: string }) {
	const cwd = opts?.cwd ?? ROOT;
	const result = spawnSync("docker", ["compose", ...args], {
		cwd,
		stdio: "inherit",
		env: { ...process.env, DATABASE_URL },
	});
	return result.status ?? 1;
}

async function startInfrastructure() {
	log("Starting PostgreSQL and Redis via Docker Compose…");
	const exitCode = dockerCompose(["up", "-d", "postgres", "redis"]);
	if (exitCode !== 0) {
		die("Failed to start infrastructure services.");
	}
	ok("Infrastructure services started.");
}

// ─── Wait for PostgreSQL ───────────────────────────────────────────────────────
async function waitForPostgres(maxWaitMs = 60_000, intervalMs = 2_000): Promise<void> {
	log("Waiting for PostgreSQL to be ready…");
	const deadline = Date.now() + maxWaitMs;

	while (Date.now() < deadline) {
		const result = spawnSync(
			"docker",
			["compose", "exec", "-T", "postgres", "pg_isready", "-U", "apogee", "-d", "apogee_dev"],
			{ cwd: ROOT, stdio: "pipe" },
		);
		if (result.status === 0) {
			ok("PostgreSQL is ready.");
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	die(`PostgreSQL did not become ready within ${maxWaitMs / 1000}s.`);
}

// ─── Migration ────────────────────────────────────────────────────────────────
async function runMigrations() {
	log("Running database migrations…");
	const result = spawnSync("bun", ["run", "migrate"], {
		cwd: SERVER_DIR,
		stdio: "inherit",
		env: { ...process.env, DATABASE_URL },
	});
	if (result.status !== 0) {
		die("Migration failed. Check the output above for details.");
	}
	ok("Migrations applied.");
}

// ─── Seed ─────────────────────────────────────────────────────────────────────
async function runSeed() {
	log("Seeding demo data (Orbital Dynamics Corp)…");
	const result = spawnSync("bun", ["run", "seed"], {
		cwd: SERVER_DIR,
		stdio: "inherit",
		env: { ...process.env, DATABASE_URL },
	});
	if (result.status !== 0) {
		die("Seed failed. Check the output above for details.");
	}
	ok("Demo data seeded.");
}

// ─── Browser open ─────────────────────────────────────────────────────────────
function openBrowser(url: string) {
	log(`Opening ${url} in your browser…`);
	// Platform-appropriate open command
	const platform = process.platform;
	let cmd: string;
	let args: string[];
	if (platform === "darwin") {
		cmd = "open";
		args = [url];
	} else if (platform === "win32") {
		cmd = "cmd";
		args = ["/c", "start", url];
	} else {
		// Linux: try xdg-open, then sensible-browser, then warn
		cmd = "xdg-open";
		args = [url];
	}

	const result = spawnSync(cmd, args, { stdio: "pipe" });
	if (result.status !== 0) {
		warn(`Could not open browser automatically. Visit ${url} manually.`);
	}
}

// ─── Wait for server to be ready ──────────────────────────────────────────────
async function waitForServer(url: string, maxWaitMs = 30_000, intervalMs = 500): Promise<void> {
	const healthUrl = `${url.replace(/\/$/, "")}/health/live`;
	log(`Waiting for server at ${healthUrl}…`);
	const deadline = Date.now() + maxWaitMs;

	while (Date.now() < deadline) {
		try {
			const resp = await fetch(healthUrl);
			if (resp.ok) {
				ok(`Server is up at ${url}`);
				return;
			}
		} catch {
			// Not ready yet
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	warn(`Server did not respond within ${maxWaitMs / 1000}s — opening browser anyway.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
	console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════╗${RESET}`);
	console.log(`${BOLD}${CYAN}║  Apogee ERP — Demo Mode               ║${RESET}`);
	console.log(`${BOLD}${CYAN}╚══════════════════════════════════════╝${RESET}\n`);

	log("Demo credentials: demo@apogee.dev / apogee-demo");
	log(`Server URL:       ${BROWSER_URL}`);
	console.log();

	checkPrerequisites();
	await startInfrastructure();
	await waitForPostgres();
	await runMigrations();
	await runSeed();

	// Start the API server as a background child process
	log("Starting Apogee API server…");
	const server = spawn("bun", ["run", "src/index.ts"], {
		cwd: SERVER_DIR,
		stdio: "inherit",
		env: {
			...process.env,
			DATABASE_URL,
			PORT: String(SERVER_PORT),
			HOST: "0.0.0.0",
			NODE_ENV: "development",
			LOG_LEVEL: "info",
			// Disable JWT auth for demo mode so the GraphQL playground is accessible
			APP_JWT_SECRET: "",
		},
	});

	server.on("error", (err) => {
		die(`Failed to start server: ${err.message}`);
	});

	// Graceful shutdown
	const shutdown = (signal: string) => {
		log(`\nReceived ${signal} — shutting down…`);
		server.kill("SIGTERM");

		// Stop infrastructure
		log("Stopping Docker Compose services…");
		dockerCompose(["stop", "postgres", "redis"]);

		ok("Demo stopped. Goodbye!");
		process.exit(0);
	};

	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));

	// Wait for server to be ready, then open browser
	await waitForServer(BROWSER_URL);
	openBrowser(BROWSER_URL);

	ok("\nDemo is running! Press Ctrl+C to stop.");
	console.log(`\n  ${BOLD}URL:         ${BROWSER_URL}${RESET}`);
	console.log(`  ${BOLD}Email:       demo@apogee.dev${RESET}`);
	console.log(`  ${BOLD}Password:    apogee-demo${RESET}`);
	console.log(`  ${BOLD}GraphQL:     ${BROWSER_URL}/graphql${RESET}`);
	console.log(`  ${BOLD}Health:      ${BROWSER_URL}/health/live${RESET}\n`);
}

await main();
