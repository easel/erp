import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Per-route rate limit configuration.
 */
export interface RouteRateLimit {
	/** Maximum number of requests allowed within the window. */
	max: number;
	/** Rolling window duration in milliseconds. */
	windowMs: number;
}

/**
 * Global rate limiting configuration.
 *
 * Backed by an in-process sliding-window counter store.  When Redis is
 * available a Redis-backed store can be substituted via `store`; without
 * Redis the in-process store is used automatically (ADR-008 Redis-optional
 * constraint).
 */
export interface RateLimitConfig {
	/**
	 * Default limit applied to every route that has no explicit override.
	 * Defaults to 1000 req / 60 s.
	 */
	global?: RouteRateLimit;

	/**
	 * Per-route overrides keyed by exact route path (e.g. `/graphql`).
	 * Takes precedence over `global`.
	 */
	routes?: Record<string, RouteRateLimit>;

	/**
	 * Function that derives a rate-limit key from the request.
	 * Defaults to the API key header value (x-api-key) when present,
	 * falling back to the client IP.
	 */
	keyExtractor?: (req: FastifyRequest) => string;

	/**
	 * URL patterns exempt from rate limiting (health probes, metrics).
	 * Defaults to /^\/health\// and /^\/metrics$/.
	 */
	bypass?: RegExp[];

	/**
	 * Pluggable store for rate-limit counters.  Defaults to the built-in
	 * in-memory store.  Inject a Redis-backed store for multi-node
	 * deployments (ADR-008).
	 */
	store?: RateLimitStore;
}

/**
 * Abstract store interface so the in-memory and Redis implementations
 * share the same contract.
 */
export interface RateLimitStore {
	/**
	 * Increment the hit counter for `key` within a rolling window of
	 * `windowMs` milliseconds.  Returns the updated count after the increment.
	 */
	increment(key: string, windowMs: number): Promise<number> | number;

	/** Optional cleanup hook called when the Fastify instance closes. */
	destroy?(): Promise<void> | void;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory sliding-window store
// ─────────────────────────────────────────────────────────────────────────────

interface WindowEntry {
	/** Timestamps of individual requests within the current window. */
	timestamps: number[];
}

/**
 * Thread-safe (single-process) sliding-window rate-limit store.
 *
 * Each call to `increment` prunes timestamps outside the current window
 * and appends a new one, returning the updated window size.  A periodic
 * sweep removes fully-expired entries to bound memory usage.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
	private readonly counters = new Map<string, WindowEntry>();
	private sweepTimer: ReturnType<typeof setInterval> | null = null;

	constructor(sweepIntervalMs = 60_000) {
		// Periodically evict entries whose entire window has expired.
		this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
		// Allow the process to exit cleanly even if the timer is still live.
		if (this.sweepTimer.unref) this.sweepTimer.unref();
	}

	increment(key: string, windowMs: number): number {
		const now = Date.now();
		const cutoff = now - windowMs;

		let entry = this.counters.get(key);
		if (entry === undefined) {
			entry = { timestamps: [] };
			this.counters.set(key, entry);
		}

		// Drop timestamps that have slid out of the current window.
		entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
		entry.timestamps.push(now);

		return entry.timestamps.length;
	}

	private sweep(): void {
		const now = Date.now();
		for (const [key, entry] of this.counters) {
			// If the newest timestamp is old enough that any reasonable window
			// would have expired, evict the entry.
			const newest = entry.timestamps.at(-1) ?? 0;
			// Use a generous 1-hour cutoff so we don't evict entries for slow
			// routes that have long windows.
			if (now - newest > 3_600_000) {
				this.counters.delete(key);
			}
		}
	}

	async destroy(): Promise<void> {
		if (this.sweepTimer !== null) {
			clearInterval(this.sweepTimer);
			this.sweepTimer = null;
		}
		this.counters.clear();
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Fastify plugin
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BYPASS: RegExp[] = [/^\/health\//, /^\/metrics$/];

const DEFAULT_GLOBAL: RouteRateLimit = {
	max: 1000,
	windowMs: 60_000, // 1 minute
};

function defaultKeyExtractor(req: FastifyRequest): string {
	// Prefer an explicit API key header so per-key limits work correctly.
	const apiKey = req.headers["x-api-key"];
	if (typeof apiKey === "string" && apiKey.length > 0) return `apikey:${apiKey}`;

	// Fall back to client IP (Fastify normalises this to a string).
	return `ip:${req.ip}`;
}

/**
 * Register a sliding-window rate-limiting hook on the Fastify instance.
 *
 * Responds with HTTP 429 and a `Retry-After` header when a client exceeds
 * the configured limit.  The store defaults to the in-process
 * `InMemoryRateLimitStore`; swap it for a Redis-backed store in multi-node
 * deployments (ADR-008).
 */
export function registerRateLimit(app: FastifyInstance, config: RateLimitConfig = {}): void {
	const bypass = config.bypass ?? DEFAULT_BYPASS;
	const global = config.global ?? DEFAULT_GLOBAL;
	const routes = config.routes ?? {};
	const keyExtractor = config.keyExtractor ?? defaultKeyExtractor;
	const store = config.store ?? new InMemoryRateLimitStore();

	app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
		// Skip rate limiting for exempt routes.
		if (bypass.some((re) => re.test(req.url))) return;

		// Determine the applicable limit for this route.
		const routePath = req.routeOptions?.url ?? req.url;
		const limit = routes[routePath] ?? global;

		const key = keyExtractor(req);
		const storeKey = `${key}:${routePath}`;

		const count = await store.increment(storeKey, limit.windowMs);

		// Always expose the limit headers so clients can self-throttle.
		const remaining = Math.max(0, limit.max - count);
		reply.header("X-RateLimit-Limit", String(limit.max));
		reply.header("X-RateLimit-Remaining", String(remaining));
		reply.header("X-RateLimit-Window", String(limit.windowMs));

		if (count > limit.max) {
			const retryAfterSeconds = Math.ceil(limit.windowMs / 1000);
			reply.header("Retry-After", String(retryAfterSeconds));
			throw Object.assign(new Error("Too Many Requests"), {
				statusCode: 429,
				name: "TooManyRequests",
			});
		}
	});

	// Clean up the store when the server closes.
	app.addHook("onClose", async () => {
		await store.destroy?.();
	});
}
