import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { getVideoProgress, listUserVideos, mapVideoStatus } from "@/lib/video-store";

/**
 * GET  /api/videos       — list all uploaded videos for the current user (from local DB)
 * POST /api/videos       — deprecated; use /api/videos/upload instead
 */

export async function GET(req: NextRequest) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  try {
    const videos = await listUserVideos(guard.value.user.id);
    return NextResponse.json(
      videos.map((v) => ({
        id: v.id,
        name: v.filename,
        path: v.filename,
        size_bytes: v.fileSize,
        duration_seconds: v.durationSeconds,
        status: mapVideoStatus(v),
        error: null,
        thumbnail_url: null,
        created_at: v.createdAt.toISOString(),
        updated_at: v.updatedAt.toISOString(),
        embedding_status: v.embeddingStatus,
        chunks_processed: v.chunksProcessed,
        total_chunks: v.totalChunks,
        progress: getVideoProgress(v),
      })),
    );
  } catch (err) {
    console.error("[/api/videos GET] error:", err);
    return NextResponse.json({ message: "Failed to list videos." }, { status: 500 });
  }
}
