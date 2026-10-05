import { NextResponse } from "next/server";
import { sharedRedis } from "@/lib/redis";

/**
 * Sliding/fixed-window rate limiter for expensive routes
 * (upload / process / search / query / summarize).
 *
 * Why: with thousands of concurrent users, a few abusive clients can starve
 * shared resources (HF concurrency slots, DB pool, FFmpeg CPU). This sheds
 * excess load per user with 429s instead of letting everything degrade.
 *
 * Stores: in-memory buckets by default (single instance). When REDIS_URL is
 * set, counters live in the shared Redis so every replica behind the load
 * balancer enforces the same budget — no code changes at the call sites.
 *
 * Tune with:
 *   RATE_LIMIT_WINDOW_MS — window length (default 60000)
 *   RATE_LIMIT_MAX       — max requests per key per window (default 60)
 *   RATE_LIMIT_STRICT_MAX — max for heavy routes: upload/process (default 20)
 *   RATE_LIMIT_DISABLED  — set to "1"/"true" to bypass (tests, local dev)
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the window resets (for Retry-After). */
  retryAfterSeconds: number;
}

interface BucketStore {
  /** Record a hit; returns the 1-based count in the current window. */
  hit(key: string, windowMs: number): Promise<number>;
}

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : fallback;
}

export function rateLimitDisabled(): boolean {
  const raw = (process.env.RATE_LIMIT_DISABLED ?? "").toLowerCase();
  return raw === "1" || raw === "true";
}

function windowMs(): number {
  return Math.max(1000, envInt("RATE_LIMIT_WINDOW_MS", 60_000));
}

// ---------------------------------------------------------------------------
// In-memory store (single instance)
// ---------------------------------------------------------------------------

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

function prune(bucket: Bucket, now: number, window: number): void {
  const cutoff = now - window;
  while (bucket.timestamps.length > 0 && bucket.timestamps[0] <= cutoff) {
    bucket.timestamps.shift();
  }
}

// Periodic sweep so the map cannot grow without bound.
setInterval(
  () => {
    const now = Date.now();
    const window = windowMs();
    for (const [key, bucket] of buckets) {
      prune(bucket, now, window);
      if (bucket.timestamps.length === 0) buckets.delete(key);
      if (buckets.size > 100_000) break;
    }
  },
  60_000,
).unref?.();

const memoryStore: BucketStore = {
  async hit(key: string, window: number): Promise<number> {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      buckets.set(key, bucket);
    }
    prune(bucket, now, window);
    bucket.timestamps.push(now);
    return bucket.timestamps.length;
  },
};

// ---------------------------------------------------------------------------
// Shared Redis store (multi-instance). Fixed windows keyed by window index;
// falls back to memory when Redis is unreachable (fail open for uptime).
// ---------------------------------------------------------------------------

const redisStore: BucketStore = {
  async hit(key: string, window: number): Promise<number> {
    const client = sharedRedis();
    if (!client) return memoryStore.hit(key, window);
    const windowIndex = Math.floor(Date.now() / window);
    const count = await client.incrWithExpiry(`rl:${key}:${windowIndex}`, window);
    if (count === null) return memoryStore.hit(key, window);
    return count;
  },
};

function store(): BucketStore {
  return (process.env.REDIS_URL ?? "").trim() ? redisStore : memoryStore;
}

/** Pure check-and-record step; swap the store to go multi-instance. */
export async function checkRateLimit(key: string, max: number): Promise<RateLimitDecision> {
  const window = windowMs();
  const count = await store().hit(`rl:${key}`, window);
  if (count > max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(window / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function rateLimitResponse(decision: RateLimitDecision): NextResponse {
  return NextResponse.json(
    { message: "Too many requests. Please slow down and try again.", code: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(decision.retryAfterSeconds) },
    },
  );
}

/**
 * Guard helper for route handlers. Returns a 429 response when over the
 * limit, otherwise null (proceed). `strict` selects the lower heavy-route
 * budget (uploads, processing, VLM Q&A).
 */
export async function applyRateLimit(
  key: string,
  strict = false,
): Promise<NextResponse | null> {
  if (rateLimitDisabled()) return null;
  const max = strict
    ? envInt("RATE_LIMIT_STRICT_MAX", 20)
    : envInt("RATE_LIMIT_MAX", 60);
  const decision = await checkRateLimit(key, Math.max(1, max));
  if (!decision.allowed) return rateLimitResponse(decision);
  return null;
}
