import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { applyRateLimit } from "@/lib/rate-limit";
import { uploadVideo } from "@/lib/video-store";

/**
 * POST /api/videos/upload — multipart upload to shared storage.
 *
 * Saves the video file, creates a DB record, and enqueues an embedding job
 * (see lib/jobs + lib/video-worker). The worker poller on any app instance
 * picks the job up, so uploads return fast under load.
 *
 * Query params:
 *   ?process=true  — with VIDEO_WORKER_INLINE (default true) runs embedding
 *     synchronously as before (local dev); with inline disabled the job is
 *     left queued for the worker pool (scaled deployments).
 */

const SUPPORTED_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".webm"];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
// Caps so one request cannot OOM the server: Next.js buffers multipart bodies
// in memory before the handler runs.
const MAX_FILES_PER_REQUEST = 5;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 GiB

export async function POST(req: NextRequest) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const limited = await applyRateLimit(`upload:${guard.value.user.id}`, true);
  if (limited) return limited;

  try {
    const formData = await req.formData();
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ message: "No files were uploaded." }, { status: 400 });
    }

    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { message: `Upload at most ${MAX_FILES_PER_REQUEST} files per request.` },
        { status: 413 },
      );
    }

    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { message: "Combined upload size exceeds the 1 GiB per-request limit." },
        { status: 413 },
      );
    }

    const shouldProcess = req.nextUrl.searchParams.get("process") === "true";
    const results: Array<{
      videoId: string;
      filename: string;
      size: number;
      status: string;
    }> = [];

    for (const file of files) {
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        results.push({
          videoId: "",
          filename: file.name,
          size: file.size,
          status: "rejected",
        });
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { message: `File ${file.name} exceeds the 500 MB upload limit.` },
          { status: 413 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const { videoId, filePath } = await uploadVideo(
        guard.value.user.id,
        file.name,
        buffer,
      );

      const { enqueueVideoJob } = await import("@/lib/jobs");
      const { ensureVideoWorker, inlineWorkerEnabled } = await import("@/lib/video-worker");
      await enqueueVideoJob(videoId, guard.value.user.id);
      ensureVideoWorker();

      let status = "pending";
      if (shouldProcess) {
        if (inlineWorkerEnabled()) {
          try {
            const { processVideo } = await import("@/lib/video-store");
            const { completeJobsForVideo } = await import("@/lib/jobs");
            await processVideo(videoId, filePath);
            await completeJobsForVideo(videoId);
            status = "ready";
          } catch (e) {
            console.error(`Processing failed for ${file.name}:`, e);
            status = "error";
          }
        } else {
          // Left queued for the worker pool; the client polls for completion.
          status = "queued";
        }
      }

      results.push({
        videoId,
        filename: file.name,
        size: file.size,
        status,
      });
    }

    return NextResponse.json({ uploaded: results.length, videos: results });
  } catch (err) {
    console.error("[/api/videos/upload] error:", err);
    return NextResponse.json({ message: "Upload failed." }, { status: 500 });
  }
}
