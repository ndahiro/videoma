import { hostname } from "os";
import { db, eq, sql, videoJobsTable } from "@/lib/db";
import {
  claimNextJob,
  completeVideoJob,
  failVideoJob,
} from "@/lib/jobs";

/**
 * In-process embedding worker (server-only — never import from a client
 * component).
 *
 * Each app instance runs this poller; Postgres SKIP LOCKED (see lib/jobs)
 * deals out each job to exactly one instance, so scaling out is just
 * `docker compose up --scale vss-ui=N`. No dedicated worker service, no new
 * dependencies.
 *
 * Tune with:
 *   VIDEO_WORKER_ENABLED      — "0"/"false" disables the poller (default on)
 *   VIDEO_WORKER_INTERVAL_MS  — poll interval (default 5000)
 *   VIDEO_WORKER_CONCURRENCY  — parallel jobs per instance (default 2)
 *   VIDEO_JOB_STALE_MS        — running jobs older than this with no update
 *     are assumed orphaned (crashed worker) and requeued (default 30 min)
 */

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : fallback;
}

function workerEnabled(): boolean {
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  const raw = (process.env.VIDEO_WORKER_ENABLED ?? "").toLowerCase();
  return raw !== "0" && raw !== "false";
}

/**
 * Whether routes should process embeddings inline (synchronously) instead
 * of leaving jobs queued. Default true (local dev behaves as before);
 * scaled deployments set VIDEO_WORKER_INLINE=false so instances only
 * enqueue and the worker pool does the heavy lifting.
 */
export function inlineWorkerEnabled(): boolean {
  const raw = (process.env.VIDEO_WORKER_INLINE ?? "true").toLowerCase();
  return raw !== "0" && raw !== "false";
}

const workerId =
  `${hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

let started = false;
let activeJobs = 0;
let tickInFlight = false;

/** Return long-running jobs to the queue (crashed worker recovery). */
async function requeueStaleJobs(): Promise<void> {
  const staleMs = envInt("VIDEO_JOB_STALE_MS", 30 * 60 * 1000);
  if (staleMs <= 0) return;
  const cutoff = new Date(Date.now() - staleMs);
  try {
    await db
      .update(videoJobsTable)
      .set({ status: "queued", lockedBy: null, updatedAt: new Date() })
      .where(
        sql`${videoJobsTable.status} = 'running' AND ${videoJobsTable.updatedAt} < ${cutoff.toISOString()}`,
      );
  } catch (err) {
    console.error("[video-worker] stale requeue failed:", err);
  }
}

async function runOneJob(): Promise<boolean> {
  const claimed = await claimNextJob(workerId).catch((err) => {
    console.error("[video-worker] claim failed:", err);
    return null;
  });
  if (!claimed) return false;

  activeJobs += 1;
  void (async () => {
    try {
      const { processVideo, getVideoFilePath } = await import("@/lib/video-store");
      const filePath = await getVideoFilePath(claimed.videoId);
      if (!filePath) {
        throw new Error("Video file not found on disk.");
      }
      const result = await processVideo(claimed.videoId, filePath);
      await completeVideoJob(claimed.id, result.chunksProcessed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[video-worker] job ${claimed.id} failed:`, message);
      try {
        await failVideoJob(claimed.id, claimed.videoId, message.slice(0, 1000));
      } catch (dbErr) {
        console.error("[video-worker] fail bookkeeping failed:", dbErr);
      }
    } finally {
      activeJobs = Math.max(0, activeJobs - 1);
    }
  })();

  return true;
}

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    await requeueStaleJobs();
    const concurrency = Math.max(1, envInt("VIDEO_WORKER_CONCURRENCY", 2));
    while (activeJobs < concurrency) {
      const gotWork = await runOneJob();
      if (!gotWork) break;
    }
  } finally {
    tickInFlight = false;
  }
}

/**
 * Start the poller once per process. Safe to call from any route handler;
 * subsequent calls are no-ops.
 */
export function ensureVideoWorker(): void {
  if (started || typeof window !== "undefined") return;
  if (!workerEnabled()) return;
  started = true;
  const intervalMs = Math.max(1000, envInt("VIDEO_WORKER_INTERVAL_MS", 5000));
  const timer = setInterval(() => {
    void tick().catch((err) => console.error("[video-worker] tick failed:", err));
  }, intervalMs);
  timer.unref?.();
  console.log(
    `[video-worker] started (${workerId}, every ${intervalMs}ms)`,
  );
}
