import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { applyRateLimit } from "@/lib/rate-limit";
import { getOwnedVideo, getVideoFilePath, getVideoProgress } from "@/lib/video-store";

/**
 * POST /api/videos/{videoId}/process — generate HuggingFace embeddings for a video.
 *
 * Uses the system ffmpeg binary (FFMPEG_PATH, default "ffmpeg" on PATH) to
 * extract keyframes, then calls:
 *   - HF CLIP (openai/clip-vit-large-patch14) for image embeddings
 *   - HF BLIP (Salesforce/blip-image-captioning-base) for frame captions
 *
 * With VIDEO_WORKER_INLINE (default true) this runs synchronously as before
 * (the UI polls /api/videos/{id} for completion). With inline disabled the
 * request only enqueues a job (see lib/jobs) and the worker pool on any app
 * instance picks it up — the shape of the response is unchanged.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  // Embedding jobs burn FFmpeg CPU + dozens of HF calls; bound per user.
  const limited = await applyRateLimit(`process:${guard.value.user.id}`, true);
  if (limited) return limited;

  const { videoId } = await params;

  try {
    const video = await getOwnedVideo(videoId, guard.value.user.id);
    if (!video) {
      return NextResponse.json({ message: "Video not found." }, { status: 404 });
    }

    if (video.embeddingStatus === "complete") {
      return NextResponse.json({
        id: `job-${videoId}`,
        video_id: videoId,
        video_name: video.filename,
        type: "embedding",
        status: "done",
        progress: 100,
        created_at: video.createdAt.toISOString(),
        updated_at: video.updatedAt.toISOString(),
      });
    }

    const { enqueueVideoJob, completeJobsForVideo } =
      await import("@/lib/jobs");
    const { ensureVideoWorker, inlineWorkerEnabled } =
      await import("@/lib/video-worker");
    const job = await enqueueVideoJob(videoId, guard.value.user.id);
    ensureVideoWorker();

    if (!inlineWorkerEnabled()) {
      // Queued for the worker pool; the client keeps polling for completion.
      return NextResponse.json({
        id: job.id,
        video_id: videoId,
        video_name: video.filename,
        type: "embedding",
        status: job.status === "running" ? "running" : "queued",
        progress: getVideoProgress(video),
        chunks_processed: video.chunksProcessed,
        total_chunks: video.totalChunks,
        created_at: video.createdAt.toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    const filePath = await getVideoFilePath(videoId);
    if (!filePath) {
      return NextResponse.json(
        { message: "Video file not found on disk." },
        { status: 404 },
      );
    }

    const { processVideo } = await import("@/lib/video-store");
    const result = await processVideo(videoId, filePath);
    await completeJobsForVideo(videoId);

    return NextResponse.json({
      id: `job-${videoId}`,
      video_id: videoId,
      video_name: video.filename,
      type: "embedding",
      status: "done",
      progress: 100,
      chunks_processed: result.chunksProcessed,
      created_at: video.createdAt.toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/videos/{id}/process] error:", err);
    return NextResponse.json({ message: "Processing failed." }, { status: 500 });
  }
}
