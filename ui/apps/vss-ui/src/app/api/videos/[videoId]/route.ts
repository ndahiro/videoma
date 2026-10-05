import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { getOwnedVideo, getVideoProgress, mapVideoStatus, deleteVideo } from "@/lib/video-store";

/**
 * GET    /api/videos/{videoId} — single video metadata (from local DB)
 * DELETE /api/videos/{videoId} — remove video + embeddings
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { videoId } = await params;

  try {
    const video = await getOwnedVideo(videoId, guard.value.user.id);
    if (!video) {
      return NextResponse.json({ message: "Video not found." }, { status: 404 });
    }

    const status = mapVideoStatus(video);

    return NextResponse.json({
      id: video.id,
      name: video.filename,
      path: video.filename,
      size_bytes: video.fileSize,
      duration_seconds: video.durationSeconds,
      status,
      error: null,
      thumbnail_url: null,
      created_at: video.createdAt.toISOString(),
      updated_at: video.updatedAt.toISOString(),
      embedding_status: video.embeddingStatus,
      chunks_processed: video.chunksProcessed,
      total_chunks: video.totalChunks,
      progress: getVideoProgress(video),
      stream_url: `/api/videos/stream/${video.id}`,
    });
  } catch (err) {
    console.error("[/api/videos/{id} GET] error:", err);
    return NextResponse.json({ message: "Failed to fetch video." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { videoId } = await params;

  try {
    const deleted = await deleteVideo(videoId, guard.value.user.id);
    if (!deleted) {
      return NextResponse.json({ message: "Video not found." }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[/api/videos/{id} DELETE] error:", err);
    return NextResponse.json({ message: "Failed to delete video." }, { status: 500 });
  }
}
