import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { listUserVideos } from "@/lib/video-store";

/**
 * GET /api/stats — derive totals from the local video DB.
 *
 * No agent needed: stats come from the videos table in PostgreSQL.
 * Read-only, does not consume quota.
 */

export async function GET(req: NextRequest) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  try {
    const videos = await listUserVideos(guard.value.user.id);

    const total = videos.length;
    const ready = videos.filter(
      (v) => v.embeddingStatus === "complete",
    ).length;
    const processing = videos.filter(
      (v) => v.embeddingStatus === "processing" || v.embeddingStatus === "pending",
    ).length;
    const error = videos.filter(
      (v) => v.uploadStatus === "error",
    ).length;

    return NextResponse.json({
      total_videos: total,
      ready_videos: ready,
      processing_videos: processing,
      error_videos: error,
      total_jobs: 0,
      active_jobs: 0,
    });
  } catch (err) {
    console.error("[/api/stats] error:", err);
    return NextResponse.json(
      {
        total_videos: 0,
        ready_videos: 0,
        processing_videos: 0,
        error_videos: 0,
        total_jobs: 0,
        active_jobs: 0,
      },
      { status: 200 },
    );
  }
}
