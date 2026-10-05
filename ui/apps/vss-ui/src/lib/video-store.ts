import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { db, videosTable, videoEmbeddingsTable, qaHistoryTable, and, eq, desc } from "@/lib/db";
import {
  getTextEmbedding,
  videoQuestionAnswer,
  captionImage,
} from "@/lib/hf";

import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import ffmpegStaticPath from "ffmpeg-static";

const VIDEO_UPLOAD_DIR =
  process.env.VIDEO_UPLOAD_DIR || join(tmpdir(), "videoma_videos");
const FRAME_DIR = join(VIDEO_UPLOAD_DIR, "frames");
const FRAME_INTERVAL_SECONDS = Number(process.env.HF_FRAME_INTERVAL) || 5;
const MAX_FRAMES = Number(process.env.HF_MAX_FRAMES) || 20;

// Frame extraction shells out to an ffmpeg binary. Resolution order:
//   1. FFMPEG_PATH env (absolute path, e.g. C:/ffmpeg/bin/ffmpeg.exe).
//      Resolved per call (not at import) so editing .env.local + restarting
//      `next dev` picks it up without stale module state.
//   2. `ffmpeg-static` npm binary (works on Windows dev without PATH setup).
//   3. "ffmpeg" on PATH (the Docker image installs it via `apk add ffmpeg`).
//   FFMPEG_TIMEOUT_MS  — hard cap per extraction (default 5 min)
function resolveFfmpegBin(): string {
  const fromEnv = (process.env.FFMPEG_PATH || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (fromEnv) return fromEnv;
  if (
    typeof ffmpegStaticPath === "string" &&
    ffmpegStaticPath &&
    existsSync(ffmpegStaticPath)
  ) {
    return ffmpegStaticPath;
  }
  return "ffmpeg";
}
const FFMPEG_TIMEOUT_MS =
  Number(process.env.FFMPEG_TIMEOUT_MS) > 0
    ? Math.floor(Number(process.env.FFMPEG_TIMEOUT_MS))
    : 300_000;
const execFileAsync = promisify(execFile);

// Bounds for high-concurrency safety (tune via env):
// - FRAME_CONCURRENCY: parallel per-frame HF calls within one video job.
//   Combined with the global HF_CONCURRENCY cap in lib/hf, bursts queue
//   instead of stampeding the inference API.
// - EMBEDDING_SCAN_CAP: max embedding rows pulled into memory per
//   search/query request (a video holds ~MAX_FRAMES rows; the cap is a
//   guard rail, not a limit on normal use).
// - MAX_TOP_K: largest top_k a client may request.
const FRAME_CONCURRENCY =
  Number(process.env.VIDEO_FRAME_CONCURRENCY) > 0
    ? Math.floor(Number(process.env.VIDEO_FRAME_CONCURRENCY))
    : 4;
const EMBEDDING_SCAN_CAP =
  Number(process.env.EMBEDDING_SCAN_CAP) > 0
    ? Math.floor(Number(process.env.EMBEDDING_SCAN_CAP))
    : 5000;
export const MAX_TOP_K = 50;

export function clampTopK(topK: number): number {
  if (!Number.isFinite(topK)) return 5;
  return Math.min(MAX_TOP_K, Math.max(1, Math.floor(topK)));
}

/** UI-facing status for a video row (single source of truth). */
export function mapVideoStatus(video: Pick<VideoRecord, "embeddingStatus" | "uploadStatus">): string {
  if (video.embeddingStatus === "pending") return "pending";
  if (video.embeddingStatus === "complete") return "ready";
  if (video.embeddingStatus === "processing") return "processing";
  return video.uploadStatus;
}

export interface VideoRecord {
  id: string;
  filename: string;
  fileSize: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  uploadStatus: string;
  embeddingStatus: string;
  chunksProcessed: number | null;
  totalChunks: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Best-effort progress write. Progress updates must never fail the embedding
 * job itself, so errors are logged and swallowed.
 */
async function updateVideoProgress(
  videoId: string,
  patch: {
    embeddingStatus?: string;
    chunksProcessed?: number;
    totalChunks?: number;
  },
): Promise<void> {
  try {
    await db
      .update(videosTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(videosTable.id, videoId as any));
  } catch (err) {
    console.warn(`[video-store] progress update failed for ${videoId}:`, err);
  }
}

/**
 * 0-100 embedding progress for a video row. Capped at 99 while processing
 * so the bar only reaches 100 once the run is marked complete.
 */
export function getVideoProgress(video: {
  embeddingStatus: string;
  chunksProcessed: number | null;
  totalChunks: number | null;
}): number {
  if (video.embeddingStatus === "complete") return 100;
  if (video.embeddingStatus !== "processing") return 0;
  const total = video.totalChunks ?? 0;
  const done = video.chunksProcessed ?? 0;
  if (total <= 0) return 0;
  return Math.min(99, Math.round((done / total) * 100));
}

export interface EmbeddingRecord {
  id: string;
  videoId: string;
  chunkIndex: number;
  timestampStart: number | null;
  timestampEnd: number | null;
  framePath: string | null;
  textContent: string | null;
  createdAt: Date;
}

async function ensureDirs() {
  await mkdir(VIDEO_UPLOAD_DIR, { recursive: true });
  await mkdir(FRAME_DIR, { recursive: true });
}

export async function saveVideoFile(
  filename: string,
  buffer: Buffer,
): Promise<string> {
  await ensureDirs();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = join(VIDEO_UPLOAD_DIR, safeName);
  await writeFile(path, buffer);
  return path;
}

/**
 * Run the system ffmpeg binary and surface actionable errors. A missing
 * binary or a decode failure both land here so the embedding job fails with a
 * clear message instead of producing zero chunks silently.
 */
async function runFfmpeg(args: string[]): Promise<void> {
  const bin = resolveFfmpegBin();
  try {
    await execFileAsync(bin, args, {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string | Buffer };
    if (e.code === "ENOENT") {
      throw new Error(
        `ffmpeg executable not found (tried "${bin}"). ` +
          "Install ffmpeg, or set FFMPEG_PATH in ui/apps/vss-ui/.env.local " +
          "to its full path (e.g. C:/ffmpeg/bin/ffmpeg.exe) and restart " +
          "`pnpm dev`. The ffmpeg-static npm dependency is bundled as a " +
          "fallback — run `pnpm install` if its binary is missing.",
      );
    }
    const stderr = Buffer.isBuffer(e.stderr) ? e.stderr.toString() : e.stderr ?? "";
    throw new Error(`ffmpeg frame extraction failed: ${stderr.trim() || e.message}`);
  }
}

export async function extractFrames(
  videoPath: string,
  videoId: string,
): Promise<Array<{ timestamp: number; dataUrl: string; filePath: string }>> {
  await ensureDirs();

  const step = FRAME_INTERVAL_SECONDS > 0 ? FRAME_INTERVAL_SECONDS : 1;
  // One ffmpeg pass samples a frame every `step` seconds, capped at
  // MAX_FRAMES. Output is written straight to disk (frame_<id>_001.jpg, …),
  // so the whole video and every frame are never held in memory at once.
  const outputPattern = join(FRAME_DIR, `frame_${videoId}_%03d.jpg`);
  const fps = (1 / step).toString();

  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-vf",
    `fps=${fps}`,
    "-frames:v",
    String(MAX_FRAMES),
    "-q:v",
    "2",
    "-y",
    outputPattern,
  ]);

  const frames: Array<{ timestamp: number; dataUrl: string; filePath: string }> = [];
  for (let i = 0; i < MAX_FRAMES; i++) {
    const frameName = `frame_${videoId}_${String(i + 1).padStart(3, "0")}.jpg`;
    const filePath = join(FRAME_DIR, frameName);
    let buf: Buffer;
    try {
      buf = await readFile(filePath);
    } catch {
      break; // No further frames were written — end of video or cap reached.
    }
    frames.push({
      timestamp: i * step,
      dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}`,
      filePath,
    });
  }

  return frames;
}

export async function uploadVideo(
  userId: string,
  filename: string,
  buffer: Buffer,
): Promise<{ videoId: string; filePath: string }> {
  // Namespace the object name per video: with thousands of users uploading
  // "clip.mp4" concurrently, a bare filename would overwrite other users'
  // files (and leak across replicas sharing the volume). `filename` keeps
  // the display name; `storedPath` is the unique object on disk.
  const videoId = randomUUID();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${videoId}_${safeName}`;
  const filePath = await saveVideoFile(storedName, buffer);

  await db.insert(videosTable).values({
    id: videoId as any,
    userId: userId as any,
    filename,
    storedPath: storedName,
    fileSize: buffer.length,
    uploadStatus: "uploaded",
    embeddingStatus: "pending",
  });

  return { videoId, filePath };
}

export async function processVideo(
  videoId: string,
  videoPath: string,
): Promise<{ chunksProcessed: number }> {
  // Mark the run as started so the UI can show a progress bar right away.
  await updateVideoProgress(videoId, {
    embeddingStatus: "processing",
    chunksProcessed: 0,
    totalChunks: 0,
  });

  try {
    const frames = await extractFrames(videoPath, videoId);

    if (frames.length === 0) {
      throw new Error("No frames could be extracted from the video.");
    }

    // Total is known only after extraction — publish it so the UI can
    // render a real percentage instead of an estimate.
    await updateVideoProgress(videoId, { totalChunks: frames.length });

  // Process frames with bounded parallelism: each frame needs 2 HF calls
  // (VLM caption + text embedding of the caption — serverless HF has no
  // CLIP image endpoint, so queries and frames share the text-embedding
  // space). Serial execution made one upload hold a handler for minutes;
  // unbounded parallelism stampedes the inference API. The worker pool
  // below plus the global cap in lib/hf keeps throughput high and latency
  // predictable under concurrent uploads.
  const results = new Array<{
    videoId: string;
    chunkIndex: number;
    timestampStart: number;
    timestampEnd: number;
    framePath: string;
    embedding: number[];
    textContent: string;
  } | null>(frames.length).fill(null);

  let next = 0;
  let completed = 0;
  const workers = Array.from(
    { length: Math.min(FRAME_CONCURRENCY, frames.length) },
    async () => {
      while (next < frames.length) {
        const i = next;
        next += 1;
        const frame = frames[i];
        const nextTs = frames[i + 1]?.timestamp ?? frame.timestamp + FRAME_INTERVAL_SECONDS;
        try {
          const caption = await captionImage(frame.dataUrl);
          const embedding = await getTextEmbedding(caption);
          results[i] = {
            videoId,
            chunkIndex: i,
            timestampStart: frame.timestamp,
            timestampEnd: nextTs,
            framePath: frame.filePath,
            embedding,
            textContent: caption,
          };
        } catch (e) {
          console.warn(`Failed to process frame ${i}:`, e);
        } finally {
          // Report per-frame progress so the UI progress bar advances
          // while captioning/embedding is still running.
          completed += 1;
          await updateVideoProgress(videoId, { chunksProcessed: completed });
        }
      }
    },
  );
  await Promise.all(workers);

  const embeddings = results.filter(
    (e): e is NonNullable<typeof e> => e !== null,
  );
  // Renumber so chunk indexes stay dense even if some frames failed.
  embeddings.forEach((emb, idx) => {
    emb.chunkIndex = idx;
  });

  // Single multi-row insert instead of one round-trip per frame.
  if (embeddings.length > 0) {
    await db.insert(videoEmbeddingsTable).values(
      embeddings.map((emb) => ({
        videoId: videoId as any,
        chunkIndex: emb.chunkIndex,
        timestampStart: emb.timestampStart,
        timestampEnd: emb.timestampEnd,
        framePath: emb.framePath,
        embedding: emb.embedding,
        textContent: emb.textContent,
      })),
    );
  }

  await db
    .update(videosTable)
    .set({
      embeddingStatus: "complete",
      chunksProcessed: embeddings.length,
      updatedAt: new Date(),
    })
    .where(eq(videosTable.id, videoId as any));

  return { chunksProcessed: embeddings.length };
  } catch (err) {
    // Surface failures in the UI instead of leaving the video stuck at
    // "processing" forever.
    await updateVideoProgress(videoId, { embeddingStatus: "error" });
    throw err;
  }
}

export async function searchVideoChunks(
  videoId: string,
  query: string,
  topK: number = 5,
): Promise<
  Array<{
    chunkIndex: number;
    timestampStart: number | null;
    timestampEnd: number | null;
    textContent: string | null;
    framePath: string | null;
    score: number;
  }>
> {
  const textEmbedding = await getTextEmbedding(query);
  const limit = clampTopK(topK);

  const rows = await db
    .select({
      chunkIndex: videoEmbeddingsTable.chunkIndex,
      timestampStart: videoEmbeddingsTable.timestampStart,
      timestampEnd: videoEmbeddingsTable.timestampEnd,
      textContent: videoEmbeddingsTable.textContent,
      framePath: videoEmbeddingsTable.framePath,
      embedding: videoEmbeddingsTable.embedding,
    })
    .from(videoEmbeddingsTable)
    .where(eq(videoEmbeddingsTable.videoId, videoId as any))
    .limit(EMBEDDING_SCAN_CAP);

  const scored = rows
    .map((row) => {
      const emb = row.embedding as unknown as number[] | null;
      if (!emb || emb.length !== textEmbedding.length) return null;
      const dot = emb.reduce((sum, v, i) => sum + v * textEmbedding[i], 0);
      const normA = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
      const normB = Math.sqrt(textEmbedding.reduce((sum, v) => sum + v * v, 0));
      const cosine = normA > 0 && normB > 0 ? dot / (normA * normB) : 0;
      return {
        chunkIndex: row.chunkIndex,
        timestampStart: row.timestampStart,
        timestampEnd: row.timestampEnd,
        textContent: row.textContent,
        framePath: row.framePath,
        score: cosine,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export async function askVideoQuestion(
  videoId: string,
  question: string,
): Promise<{
  answer: string;
  sources: Array<{ timestamp: number; caption: string; score: number }>;
}> {
  const textEmbedding = await getTextEmbedding(question);

  const rows = await db
    .select({
      chunkIndex: videoEmbeddingsTable.chunkIndex,
      timestampStart: videoEmbeddingsTable.timestampStart,
      timestampEnd: videoEmbeddingsTable.timestampEnd,
      textContent: videoEmbeddingsTable.textContent,
      framePath: videoEmbeddingsTable.framePath,
      embedding: videoEmbeddingsTable.embedding,
    })
    .from(videoEmbeddingsTable)
    .where(eq(videoEmbeddingsTable.videoId, videoId as any))
    .limit(EMBEDDING_SCAN_CAP);

  const scored = rows
    .map((row) => {
      const emb = row.embedding as unknown as number[] | null;
      if (!emb || emb.length !== textEmbedding.length) return null;
      const dot = emb.reduce((sum, v, i) => sum + v * textEmbedding[i], 0);
      const normA = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
      const normB = Math.sqrt(textEmbedding.reduce((sum, v) => sum + v * v, 0));
      const cosine = normA > 0 && normB > 0 ? dot / (normA * normB) : 0;
      return {
        timestampStart: row.timestampStart,
        timestampEnd: row.timestampEnd,
        textContent: row.textContent,
        framePath: row.framePath,
        score: cosine,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  scored.sort((a, b) => b.score - a.score);
  const topFrames = scored.slice(0, 5);

  const frames: string[] = [];
  const sources: Array<{ timestamp: number; caption: string; score: number }> = [];

  for (const frame of topFrames) {
    if (frame.framePath) {
      try {
        const buf = await readFile(frame.framePath);
        frames.push(`data:image/jpeg;base64,${buf.toString("base64")}`);
      } catch {
        // fallback
      }
    }
    sources.push({
      timestamp: frame.timestampStart ?? 0,
      caption: frame.textContent ?? "No description",
      score: frame.score,
    });
  }

  if (frames.length === 0) {
    throw new Error("No frames available for the requested video.");
  }

  const answer = await videoQuestionAnswer({
    video: { frames },
    question,
  });

  return { answer, sources };
}

export async function listUserVideos(userId: string): Promise<VideoRecord[]> {
  const rows = await db
    .select()
    .from(videosTable)
    .where(eq(videosTable.userId, userId as any))
    .orderBy(desc(videosTable.createdAt));

  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    fileSize: row.fileSize,
    durationSeconds: row.durationSeconds,
    width: row.width,
    height: row.height,
    uploadStatus: row.uploadStatus,
    embeddingStatus: row.embeddingStatus,
    chunksProcessed: row.chunksProcessed ?? 0,
    totalChunks: row.totalChunks ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getVideo(videoId: string): Promise<VideoRecord | null> {
  const rows = await db
    .select()
    .from(videosTable)
    .where(eq(videosTable.id, videoId as any))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    filename: row.filename,
    fileSize: row.fileSize,
    durationSeconds: row.durationSeconds,
    width: row.width,
    height: row.height,
    uploadStatus: row.uploadStatus,
    embeddingStatus: row.embeddingStatus,
    chunksProcessed: row.chunksProcessed ?? 0,
    totalChunks: row.totalChunks ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Fetch a video only if it belongs to `userId`. Returns null for missing
 * AND foreign rows alike so user IDs/row existence can't be enumerated.
 */
export async function getOwnedVideo(
  videoId: string,
  userId: string,
): Promise<VideoRecord | null> {
  const video = await getVideo(videoId);
  if (!video) return null;
  const rows = await db
    .select({ id: videosTable.id })
    .from(videosTable)
    .where(and(eq(videosTable.id, videoId as any), eq(videosTable.userId, userId as any)))
    .limit(1);
  if (rows.length === 0) return null;
  return video;
}

export async function getVideoFilePath(videoId: string): Promise<string | null> {
  const rows = await db
    .select({ filename: videosTable.filename, storedPath: videosTable.storedPath })
    .from(videosTable)
    .where(eq(videosTable.id, videoId as any))
    .limit(1);

  if (rows.length === 0) return null;

  // Prefer the namespaced object; fall back to the legacy bare filename
  // for rows written before stored_path existed.
  const VIDEO_UPLOAD_DIR =
    process.env.VIDEO_UPLOAD_DIR || join(tmpdir(), "videoma_videos");
  return join(VIDEO_UPLOAD_DIR, rows[0].storedPath ?? rows[0].filename);
}

export async function deleteVideo(videoId: string, userId: string): Promise<boolean> {
  // Ownership gate: never touch rows (or files) belonging to another user.
  const owned = await getOwnedVideo(videoId, userId);
  if (!owned) return false;

  // Collect frame files first so no orphaned images remain on disk.
  let framePaths: Array<string | null> = [];
  try {
    const frames = await db
      .select({ framePath: videoEmbeddingsTable.framePath })
      .from(videoEmbeddingsTable)
      .where(eq(videoEmbeddingsTable.videoId, videoId as any));
    framePaths = frames.map((f) => f.framePath);
  } catch {}

  try {
    await db
      .delete(videoEmbeddingsTable)
      .where(eq(videoEmbeddingsTable.videoId, videoId as any));
  } catch {}

  try {
    await db
      .delete(qaHistoryTable)
      .where(eq(qaHistoryTable.videoId, videoId as any));
  } catch {}

  const rows = await db
    .delete(videosTable)
    .where(eq(videosTable.id, videoId as any))
    .returning({ id: videosTable.id, filename: videosTable.filename, storedPath: videosTable.storedPath });

  if (rows.length > 0) {
    const VIDEO_UPLOAD_DIR =
      process.env.VIDEO_UPLOAD_DIR || join(tmpdir(), "videoma_videos");
    const videoPath = join(VIDEO_UPLOAD_DIR, rows[0].storedPath ?? rows[0].filename);
    try {
      await unlink(videoPath);
    } catch {}
    for (const framePath of framePaths) {
      if (!framePath) continue;
      try {
        await unlink(framePath);
      } catch {}
    }
  }

  return rows.length > 0;
}
