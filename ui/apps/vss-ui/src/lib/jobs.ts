import { db, eq, sql, videoJobsTable, videosTable, type VideoJob } from "@/lib/db";

/**
 * Postgres-backed embedding job queue (see schema video-jobs.ts).
 *
 * Workers on any app instance share work through one atomic
 * UPDATE ... RETURNING over FOR UPDATE SKIP LOCKED: exactly one worker wins
 * each job, no coordinator or extra service needed. Safe to run the
 * in-process poller (lib/video-worker) on every replica.
 */

export interface ClaimedJob {
  id: string;
  videoId: string;
  userId: string;
  attempts: number;
}

function rowToJob(row: VideoJob): VideoJob {
  return row;
}

/** Latest job for a video, if any. */
export async function getLatestJobForVideo(videoId: string): Promise<VideoJob | null> {
  const rows = await db
    .select()
    .from(videoJobsTable)
    .where(eq(videoJobsTable.videoId, videoId as any))
    .orderBy(sql`${videoJobsTable.createdAt} DESC`)
    .limit(1);
  return rows.length > 0 ? rowToJob(rows[0]) : null;
}

/**
 * Enqueue embedding work for a video. Idempotent: an active (queued/running)
 * job is returned as-is; a finished job is returned so callers can answer
 * "done" immediately; a failed job is reset for another attempt.
 */
export async function enqueueVideoJob(
  videoId: string,
  userId: string,
): Promise<VideoJob> {
  const existing = await getLatestJobForVideo(videoId);
  if (existing && (existing.status === "queued" || existing.status === "running")) {
    return existing;
  }
  if (existing && existing.status === "done") {
    return existing;
  }
  if (existing && existing.status === "error") {
    const [reset] = await db
      .update(videoJobsTable)
      .set({ status: "queued", attempts: 0, lastError: null, updatedAt: new Date() })
      .where(eq(videoJobsTable.id, existing.id))
      .returning();
    await db
      .update(videosTable)
      .set({ embeddingStatus: "pending", updatedAt: new Date() })
      .where(eq(videosTable.id, videoId as any));
    return rowToJob(reset);
  }

  const [job] = await db
    .insert(videoJobsTable)
    .values({ videoId: videoId as any, userId: userId as any })
    .returning();
  return rowToJob(job);
}

/**
 * Atomically claim the oldest queued job. Returns null when the queue is
 * empty (normal) — exactly one worker wins each job even with N instances.
 */
export async function claimNextJob(workerId: string): Promise<ClaimedJob | null> {
  const result = await db.execute<{
    id: string;
    video_id: string;
    user_id: string;
    attempts: number;
  }>(sql`
    UPDATE video_jobs AS j
    SET status = 'running',
        attempts = j.attempts + 1,
        locked_by = ${workerId},
        locked_at = NOW(),
        updated_at = NOW()
    WHERE j.id = (
      SELECT id FROM video_jobs
      WHERE status = 'queued'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING j.id AS id, j.video_id AS video_id, j.user_id AS user_id, j.attempts AS attempts
  `);

  const rows = (result as unknown as { rows: Array<{ id: string; video_id: string; user_id: string; attempts: number }> }).rows;
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  return { id: row.id, videoId: row.video_id, userId: row.user_id, attempts: row.attempts };
}

/** Mark a job done after successful embedding. */
export async function completeVideoJob(jobId: string, chunksProcessed: number): Promise<void> {
  await db
    .update(videoJobsTable)
    .set({ status: "done", lockedBy: null, updatedAt: new Date() })
    .where(eq(videoJobsTable.id, jobId as any));
  void chunksProcessed;
}

/**
 * Mark any queued/running jobs for a video done — used after an inline
 * (synchronous) run so a poller tick never reprocesses the same video.
 */
export async function completeJobsForVideo(videoId: string): Promise<void> {
  await db
    .update(videoJobsTable)
    .set({ status: "done", lockedBy: null, updatedAt: new Date() })
    .where(eq(videoJobsTable.videoId, videoId as any));
}

/**
 * Record a failed attempt. Returns to `queued` while attempts remain (with
 * the error saved), otherwise parks in `error` and marks the video so the
 * UI stops showing it as processing.
 */
export async function failVideoJob(jobId: string, videoId: string, message: string): Promise<void> {
  const rows = await db
    .select({ attempts: videoJobsTable.attempts, maxAttempts: videoJobsTable.maxAttempts })
    .from(videoJobsTable)
    .where(eq(videoJobsTable.id, jobId as any))
    .limit(1);
  const attempts = rows[0]?.attempts ?? 1;
  const maxAttempts = rows[0]?.maxAttempts ?? 3;

  if (attempts < maxAttempts) {
    await db
      .update(videoJobsTable)
      .set({ status: "queued", lockedBy: null, lastError: message, updatedAt: new Date() })
      .where(eq(videoJobsTable.id, jobId as any));
    return;
  }

  await db
    .update(videoJobsTable)
    .set({ status: "error", lockedBy: null, lastError: message, updatedAt: new Date() })
    .where(eq(videoJobsTable.id, jobId as any));
  await db
    .update(videosTable)
    .set({ embeddingStatus: "error", updatedAt: new Date() })
    .where(eq(videosTable.id, videoId as any));
}
