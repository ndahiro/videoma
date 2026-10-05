import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { applyRateLimit } from "@/lib/rate-limit";
import { getOwnedVideo, askVideoQuestion } from "@/lib/video-store";
import { db, qaHistoryTable } from "@/lib/db";

/**
 * POST /api/query — natural language Q&A over a specific video.
 *
 * Replaces the vss-agent /query tool with a direct HuggingFace call:
 * CLIP text embedding → retrieve top-K relevant frame embeddings from PostgreSQL →
 * send frames + question to LLaVA Video Q&A VLM.
 *
 * Request body:
 *   { video_id: string, question: string }
 *
 * Response:
 *   { question, answer, video_id, video_name, sources: [{ video_id, video_name,
 *       score, timestamp_start, timestamp_end, description, thumbnail_url }], elapsed_ms }
 */

export async function POST(req: NextRequest) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  // VLM Q&A is the most expensive call in the app; bound per user.
  const limited = await applyRateLimit(`query:${guard.value.user.id}`, true);
  if (limited) return limited;

  const started = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const { video_id: videoId, question } = body ?? {};

    if (!videoId || typeof videoId !== "string") {
      return NextResponse.json(
        { message: "video_id is required" },
        { status: 400 },
      );
    }

    const trimmedQuestion = (typeof question === "string" ? question.trim() : "").slice(0, 2000);
    if (!trimmedQuestion) {
      return NextResponse.json({ message: "question is required" }, { status: 400 });
    }

    const video = await getOwnedVideo(videoId, guard.value.user.id);
    if (!video) {
      return NextResponse.json({ message: "Video not found." }, { status: 404 });
    }

    if (video.embeddingStatus !== "complete") {
      return NextResponse.json(
        {
          message:
            "Video is still being processed. Please wait and try again.",
          video_id: videoId,
          status: "processing",
          progress: 0,
        },
        { status: 202 },
      );
    }

    const { answer, sources } = await askVideoQuestion(videoId, trimmedQuestion);

    await db.insert(qaHistoryTable).values({
      videoId: videoId as any,
      question: trimmedQuestion,
      answer,
      sources: sources as any,
    });

    return NextResponse.json({
      question: trimmedQuestion,
      answer,
      video_id: videoId,
      video_name: video.filename,
      sources: sources.map((s) => ({
        video_id: videoId,
        video_name: video.filename,
        score: s.score,
        timestamp_start: s.timestamp,
        timestamp_end: null,
        description: s.caption,
        thumbnail_url: null,
      })),
      elapsed_ms: Date.now() - started,
    });
  } catch (err) {
    console.error("[/api/query] error:", err);
    return NextResponse.json(
      {
        message:
          err instanceof Error && err.message.includes("429")
            ? "HuggingFace API rate limit exceeded. Try again in a moment."
            : "Failed to answer the question.",
      },
      { status: 503 },
    );
  }
}
