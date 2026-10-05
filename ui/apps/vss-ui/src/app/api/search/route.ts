import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { applyRateLimit } from "@/lib/rate-limit";
import { clampTopK, getOwnedVideo, searchVideoChunks } from "@/lib/video-store";

/**
 * POST /api/search — semantic search across a video's frames.
 *
 * Replaces the vss-agent /search tool with a direct HuggingFace call:
 * CLIP text embedding → cosine similarity against frame embeddings in PostgreSQL.
 *
 * Request body:
 *   { video_id: string, query: string, top_k?: number }
 *
 * Response:
 *   { query, video_id, results: [{ video_id, video_name, score, timestamp_start,
 *       timestamp_end, description, thumbnail_url }], elapsed_ms }
 */

export async function POST(req: NextRequest) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const limited = await applyRateLimit(`search:${guard.value.user.id}`);
  if (limited) return limited;

  const started = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const { video_id: videoId, query, top_k: topK } = body ?? {};

    if (!videoId || typeof videoId !== "string") {
      return NextResponse.json(
        { message: "video_id is required" },
        { status: 400 },
      );
    }

    const trimmedQuery = (typeof query === "string" ? query.trim() : "").slice(0, 2000);
    if (!trimmedQuery) {
      return NextResponse.json({ message: "query is required" }, { status: 400 });
    }

    const k = clampTopK(Number(body?.top_k));

    const video = await getOwnedVideo(videoId, guard.value.user.id);
    if (!video) {
      return NextResponse.json({ message: "Video not found." }, { status: 404 });
    }

    if (video.embeddingStatus !== "complete") {
      return NextResponse.json(
        {
          message: "Video is still being indexed. Please wait and try again.",
          video_id: videoId,
          status: "processing",
        },
        { status: 202 },
      );
    }

    const results = await searchVideoChunks(videoId, trimmedQuery, k);

    return NextResponse.json({
      query: trimmedQuery,
      video_id: videoId,
      results: results.map((r) => ({
        video_id: videoId,
        video_name: video.filename,
        score: r.score,
        timestamp_start: r.timestampStart,
        timestamp_end: r.timestampEnd,
        description: r.textContent,
        thumbnail_url: r.framePath
          ? `/api/videos/frame/${r.framePath.split(/[/\\]/).pop()}`
          : null,
      })),
      elapsed_ms: Date.now() - started,
    });
  } catch (err) {
    console.error("[/api/search] error:", err);
    return NextResponse.json(
      {
        message:
          err instanceof Error && err.message.includes("429")
            ? "HuggingFace API rate limit exceeded. Try again in a moment."
            : "Search failed.",
      },
      { status: 503 },
    );
  }
}
