import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { getOwnedVideo, getVideoFilePath } from "@/lib/video-store";
import { createReadStream, existsSync } from "fs";
import { stat } from "fs/promises";
import { extname } from "path";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
};

/**
 * GET /api/videos/stream/{videoId} — serve the video file for browser playback.
 * Uses HTTP range requests for seeking support. Streams from disk (never
 * buffers whole files) and validates ranges to avoid 500s/OOM on bad input.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { videoId } = await params;
  const video = await getOwnedVideo(videoId, guard.value.user.id);
  if (!video) {
    return NextResponse.json({ message: "Video not found." }, { status: 404 });
  }
  const filePath = await getVideoFilePath(videoId);

  if (!filePath || !existsSync(filePath)) {
    return NextResponse.json({ message: "Video not found." }, { status: 404 });
  }

  try {
    const fileStats = await stat(filePath);
    const fileSize = fileStats.size;
    const contentType = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "video/mp4";
    const range = req.headers.get("range");

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      const start = match?.[1] ? parseInt(match[1], 10) : 0;
      const end = match?.[2] ? parseInt(match[2], 10) : fileSize - 1;
      if (
        !match ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end < start ||
        start >= fileSize
      ) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }
      const clampedEnd = Math.min(end, fileSize - 1);
      const chunkSize = clampedEnd - start + 1;
      const stream = createReadStream(filePath, { start, end: clampedEnd });

      return new NextResponse(stream as unknown as BodyInit, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${clampedEnd}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    const stream = createReadStream(filePath);
    return new NextResponse(stream as unknown as BodyInit, {
      headers: {
        "Content-Length": fileSize.toString(),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error(`[stream] error serving ${videoId}:`, err);
    return NextResponse.json({ message: "Failed to stream video." }, { status: 500 });
  }
}
