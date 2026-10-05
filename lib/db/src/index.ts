import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function poolInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

// Sized for bursty SaaS traffic: the default pg pool (max 10, no connection
// timeout) exhausts under concurrent load and stalls every request behind a
// checkout. Tune via env when scaling horizontally (keep per-instance max
// modest so N instances don't overwhelm Postgres max_connections).
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: poolInt("PG_POOL_MAX", 25),
  min: poolInt("PG_POOL_MIN", 2),
  idleTimeoutMillis: poolInt("PG_POOL_IDLE_MS", 30_000),
  connectionTimeoutMillis: poolInt("PG_POOL_CONNECT_TIMEOUT_MS", 10_000),
});
pool.on("error", (err) => {
  console.error("[db] idle pool client error:", err);
});
export const db = drizzle(pool, { schema });

export * from "./schema";
