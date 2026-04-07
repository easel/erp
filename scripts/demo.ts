#!/usr/bin/env bun
/**
 * Apogee Demo Mode — Kind (Kubernetes-in-Docker)
 *
 * Stands up the full stack on a local Kind cluster:
 *   1. Create (or reuse) a Kind cluster "apogee-demo"
 *   2. Build and load container images into the cluster
 *   3. Deploy PostgreSQL, Redis, Keycloak
 *   4. Run database migrations (graphile-migrate) as a Job
 *   5. Seed the database with Orbital Dynamics Corp demo dataset as a Job
 *   6. Deploy the Apogee API server
 *   7. Print access URLs
 *
 * Requirements: docker, kind, kubectl, bun
 *
 * Ref: FEAT-009 PLT-020, issue erp-b2ef3933
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const K8S_DIR = path.join(ROOT, "k8s");
const CLUSTER_NAME = "apogee-demo";
const NAMESPACE = "apogee";
const SERVER_PORT = 3100;
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

// ─── Shell helper ─────────────────────────────────────────────────────────────
function run(cmd: string, args: string[], opts?: { cwd?: string; quiet?: boolean }): number {
	const result = spawnSync(cmd, args, {
		cwd: opts?.cwd ?? ROOT,
		stdio: opts?.quiet ? "pipe" : "inherit",
	});
	return result.status ?? 1;
}

function runOutput(cmd: string, args: string[], opts?: { cwd?: string }): string {
	const result = spawnSync(cmd, args, { cwd: opts?.cwd ?? ROOT, stdio: "pipe" });
	return result.stdout?.toString().trim() ?? "";
}

// ─── Prerequisite checks ───────────────────────────────────────────────────────
function checkPrerequisites() {
	log("Checking prerequisites...");

	const checks: [string, string[]][] = [
		["docker", ["--version"]],
		["kind", ["--version"]],
		["kubectl", ["version", "--client"]],
		["bun", ["--version"]],
	];
	for (const [cmd, args] of checks) {
		const result = spawnSync(cmd, args, { stdio: "pipe" });
		if (result.status !== 0) {
			die(`Required tool not found: ${cmd}\nPlease install it and try again.`);
		}
	}

	const dockerInfo = spawnSync("docker", ["info"], { stdio: "pipe" });
	if (dockerInfo.status !== 0) {
		die("Docker daemon is not running.\nPlease start Docker and try again.");
	}

	ok("Prerequisites OK (docker, kind, kubectl, bun)");
}

// ─── Kind cluster ─────────────────────────────────────────────────────────────
function ensureCluster() {
	log(`Ensuring Kind cluster "${CLUSTER_NAME}" exists...`);

	const clusters = runOutput("kind", ["get", "clusters"]);
	if (clusters.split("\n").includes(CLUSTER_NAME)) {
		ok(`Cluster "${CLUSTER_NAME}" already exists — reusing.`);
		// Point kubectl at it
		run("kubectl", ["cluster-info", "--context", `kind-${CLUSTER_NAME}`], { quiet: true });
		return;
	}

	log("Creating Kind cluster (this takes ~30s on first run)...");
	const exitCode = run("kind", [
		"create",
		"cluster",
		"--config",
		path.join(K8S_DIR, "kind-config.yaml"),
	]);
	if (exitCode !== 0) {
		die("Failed to create Kind cluster.");
	}
	ok("Kind cluster created.");
}

// ─── Build and load images ────────────────────────────────────────────────────
function buildAndLoadImages() {
	log("Building apogee:demo image...");
	if (run("docker", ["build", "-t", "apogee:demo", "-f", "Dockerfile", "."]) !== 0) {
		die("Failed to build apogee:demo image.");
	}

	log("Building apogee-migrate:demo image...");
	if (
		run("docker", ["build", "-t", "apogee-migrate:demo", "-f", "Dockerfile.migrate", "."]) !== 0
	) {
		die("Failed to build apogee-migrate:demo image.");
	}

	log("Loading images into Kind cluster...");
	if (run("kind", ["load", "docker-image", "apogee:demo", "--name", CLUSTER_NAME]) !== 0) {
		die("Failed to load apogee:demo into Kind.");
	}
	if (run("kind", ["load", "docker-image", "apogee-migrate:demo", "--name", CLUSTER_NAME]) !== 0) {
		die("Failed to load apogee-migrate:demo into Kind.");
	}

	ok("Images built and loaded.");
}

// ─── Deploy infrastructure ────────────────────────────────────────────────────
function deployInfra() {
	log("Deploying infrastructure (postgres, redis, keycloak)...");

	const manifests = ["namespace.yaml", "postgres.yaml", "redis.yaml", "keycloak.yaml"];
	for (const m of manifests) {
		if (run("kubectl", ["apply", "-f", path.join(K8S_DIR, m)]) !== 0) {
			die(`Failed to apply ${m}`);
		}
	}

	ok("Infrastructure manifests applied.");
}

// ─── Wait helpers ─────────────────────────────────────────────────────────────
async function waitForRollout(deployment: string, timeoutSec = 120): Promise<void> {
	log(`Waiting for ${deployment} to be ready...`);
	const exitCode = run("kubectl", [
		"rollout",
		"status",
		`deployment/${deployment}`,
		"-n",
		NAMESPACE,
		`--timeout=${timeoutSec}s`,
	]);
	if (exitCode !== 0) {
		die(`${deployment} did not become ready within ${timeoutSec}s.`);
	}
	ok(`${deployment} is ready.`);
}

async function waitForJob(jobName: string, timeoutSec = 120): Promise<void> {
	log(`Waiting for job/${jobName} to complete...`);
	const exitCode = run("kubectl", [
		"wait",
		"--for=condition=complete",
		`job/${jobName}`,
		"-n",
		NAMESPACE,
		`--timeout=${timeoutSec}s`,
	]);
	if (exitCode !== 0) {
		// Show logs to help debug
		warn(`Job ${jobName} did not complete. Fetching logs...`);
		run("kubectl", ["logs", `job/${jobName}`, "-n", NAMESPACE]);
		die(`Job ${jobName} failed or timed out.`);
	}
	ok(`Job ${jobName} completed.`);
}

// ─── Run migrations ──────────────────────────────────────────────────────────
async function runMigrations() {
	log("Running database migrations...");
	// Delete previous job run if it exists (jobs are immutable)
	run("kubectl", ["delete", "job", "migrate", "-n", NAMESPACE, "--ignore-not-found"], {
		quiet: true,
	});
	if (run("kubectl", ["apply", "-f", path.join(K8S_DIR, "migrate-job.yaml")]) !== 0) {
		die("Failed to create migrate job.");
	}
	await waitForJob("migrate", 120);
}

// ─── Run seed ────────────────────────────────────────────────────────────────
async function runSeed() {
	log("Seeding demo data (Orbital Dynamics Corp)...");
	run("kubectl", ["delete", "job", "seed", "-n", NAMESPACE, "--ignore-not-found"], { quiet: true });
	if (run("kubectl", ["apply", "-f", path.join(K8S_DIR, "seed-job.yaml")]) !== 0) {
		die("Failed to create seed job.");
	}
	await waitForJob("seed", 120);
}

// ─── Deploy app ──────────────────────────────────────────────────────────────
async function deployApp() {
	log("Deploying Apogee API server...");
	if (run("kubectl", ["apply", "-f", path.join(K8S_DIR, "apogee-server.yaml")]) !== 0) {
		die("Failed to deploy apogee-server.");
	}
	await waitForRollout("apogee-server", 120);
}

// ─── Wait for server reachable via NodePort ──────────────────────────────────
async function waitForServer(url: string, maxWaitMs = 30_000, intervalMs = 1_000): Promise<void> {
	const healthUrl = `${url.replace(/\/$/, "")}/health/live`;
	log(`Waiting for server at ${healthUrl}...`);
	const deadline = Date.now() + maxWaitMs;

	while (Date.now() < deadline) {
		try {
			const resp = await fetch(healthUrl);
			if (resp.ok) {
				ok(`Server is up at ${url}`);
				return;
			}
		} catch {
			// Not reachable yet
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	warn(`Server did not respond within ${maxWaitMs / 1000}s — it may still be starting.`);
}

// ─── Browser open ─────────────────────────────────────────────────────────────
function openBrowser(url: string) {
	log(`Opening ${url} in your browser...`);
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
		cmd = "xdg-open";
		args = [url];
	}
	const result = spawnSync(cmd, args, { stdio: "pipe" });
	if (result.status !== 0) {
		warn(`Could not open browser automatically. Visit ${url} manually.`);
	}
}

// ─── Teardown ─────────────────────────────────────────────────────────────────
function printTeardown() {
	console.log(`\n  ${BOLD}To stop the demo:${RESET}`);
	console.log(`    kind delete cluster --name ${CLUSTER_NAME}\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
	console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════╗${RESET}`);
	console.log(`${BOLD}${CYAN}║  Apogee ERP — Demo Mode (Kind)       ║${RESET}`);
	console.log(`${BOLD}${CYAN}╚══════════════════════════════════════╝${RESET}\n`);

	log("Demo credentials: demo@apogee.dev / apogee-demo");
	log(`Server URL:       ${BROWSER_URL}`);
	console.log();

	checkPrerequisites();
	ensureCluster();
	buildAndLoadImages();
	deployInfra();
	await waitForRollout("postgres", 120);
	await runMigrations();
	await runSeed();
	await deployApp();
	await waitForServer(BROWSER_URL);
	openBrowser(BROWSER_URL);

	ok("\nDemo is running on Kind!");
	console.log(`\n  ${BOLD}URL:         ${BROWSER_URL}${RESET}`);
	console.log(`  ${BOLD}Email:       demo@apogee.dev${RESET}`);
	console.log(`  ${BOLD}Password:    apogee-demo${RESET}`);
	console.log(`  ${BOLD}GraphQL:     ${BROWSER_URL}/graphql${RESET}`);
	console.log(`  ${BOLD}Health:      ${BROWSER_URL}/health/live${RESET}`);
	console.log(`  ${BOLD}Keycloak:    http://localhost:8180${RESET}`);
	printTeardown();
}

await main();
