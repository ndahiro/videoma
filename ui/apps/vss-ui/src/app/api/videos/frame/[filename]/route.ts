import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

/**
 * GET /api/videos/frame/{filename} — serve an extracted keyframe as JPEG.
 * Used by search results and Q&A sources to show the visual context.
 * Login required: filenames embed video IDs, which must not be enumerable
 * anonymously.
 */

const FRAME_DIR =
  process.env.VIDEO_UPLOAD_DIR || join(tmpdir(), "videoma_videos");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { filename } = await params;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

  try {
    const framePath = join(FRAME_DIR, "frames", safeName);
    const buf = await readFile(framePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    return NextResponse.json({ message: "Frame not found." }, { status: 404 });
  }
}
