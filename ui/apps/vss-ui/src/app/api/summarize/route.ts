import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { applyRateLimit } from "@/lib/rate-limit";
import { getOwnedVideo } from "@/lib/video-store";
import { videoQuestionAnswer, getTextEmbedding, captionImage } from "@/lib/hf";
import { db, qaHistoryTable } from "@/lib/db";
import { readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

/**
 * POST /api/summarize — generate a summary of one video using HuggingFace.
 *
 * Replaces the vss-agent /summarize tool:
 *   1. Retrieve all frame embeddings + captions from PostgreSQL
 *   2. Build a prompt from the captions (text-only summary is cheap + reliable)
 *   3. Send keyframes to HF VLM for a visual summary
 *
 * Request body: { video_id: string, style?: "brief" | "detailed" | "bullet_points" }
 */

const STYLE_INSTRUCTIONS: Record<string, string> = {
  brief: "Write a 2-3 sentence overview.",
  detailed: "Write one comprehensive paragraph covering the key events.",
  bullet_points: "Return a markdown bullet list of the key points.",
};

const FRAME_DIR =
  process.env.VIDEO_UPLOAD_DIR || join(tmpdir(), "videoma_videos");

export async function POST(req: NextRequest) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  // VLM summarization is expensive; bound per user.
  const limited = await applyRateLimit(`summarize:${guard.value.user.id}`, true);
  if (limited) return limited;

  const started = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const videoId = typeof body?.video_id === "string" ? body.video_id.trim() : "";
    const style = typeof body?.style === "string" ? body.style : "detailed";

    if (!videoId) {
      return NextResponse.json({ message: "video_id is required" }, { status: 400 });
    }

    const video = await getOwnedVideo(videoId, guard.value.user.id);
    if (!video) {
      return NextResponse.json({ message: "Video not found." }, { status: 404 });
    }

    if (video.embeddingStatus !== "complete") {
      return NextResponse.json(
        {
          message: "Video is still being processed. Please wait and try again.",
          video_id: videoId,
          status: "processing",
        },
        { status: 202 },
      );
    }

    // Gather frame captions and timestamps from the DB
    const { videoEmbeddingsTable } = await import("@/lib/db");
    const { eq, asc } = await import("drizzle-orm");
    const { db: dbClient } = await import("@/lib/db");

    const embedRows = await dbClient
      .select({
        chunkIndex: videoEmbeddingsTable.chunkIndex,
        timestampStart: videoEmbeddingsTable.timestampStart,
        timestampEnd: videoEmbeddingsTable.timestampEnd,
        textContent: videoEmbeddingsTable.textContent,
        framePath: videoEmbeddingsTable.framePath,
      })
      .from(videoEmbeddingsTable)
      .where(eq(videoEmbeddingsTable.videoId, videoId as any))
      .orderBy(asc(videoEmbeddingsTable.timestampStart));

    // Load a sample of frames (max 5) for the VLM
    const framePaths = embedRows
      .filter((r) => r.framePath)
      .slice(0, 5)
      .map((r) => r.framePath!);

    const frames: string[] = [];
    for (const fp of framePaths) {
      try {
        const buf = await readFile(fp);
        frames.push(`data:image/jpeg;base64,${buf.toString("base64")}`);
      } catch {}
    }

    const instruction = STYLE_INSTRUCTIONS[style] ?? STYLE_INSTRUCTIONS.detailed;
    const question = `${instruction} Summarize what is happening in this video content across these keyframes. Include notable timestamps (seconds from start) in the summary.`;

    let summary: string;

    if (frames.length > 0) {
      summary = await videoQuestionAnswer({
        video: { frames },
        question,
      });
    } else {
      // Fallback: summarize from captions only
      const captions = embedRows
        .filter((r) => r.textContent)
        .map((r) => `[${r.timestampStart ?? 0}s] ${r.textContent}`)
        .join("\n");

      summary = await videoQuestionAnswer({
        video: { frames: [] },
        question: `Based on these frame descriptions, ${instruction} Summarize what is happening in the video. Include timestamps.\n\nFrame descriptions:\n${captions}`,
      });
    }

    await db.insert(qaHistoryTable).values({
      videoId: videoId as any,
      question: `Summarize (${style})`,
      answer: summary,
      sources: embedRows as any,
    });

    return NextResponse.json({
      video_id: videoId,
      video_name: video.filename,
      summary,
      elapsed_ms: Date.now() - started,
    });
  } catch (err) {
    console.error("[/api/summarize] error:", err);
    return NextResponse.json(
      {
        message:
          err instanceof Error && err.message.includes("429")
            ? "HuggingFace API rate limit exceeded. Try again in a moment."
            : "Summarization failed.",
      },
      { status: 503 },
    );
  }
}
