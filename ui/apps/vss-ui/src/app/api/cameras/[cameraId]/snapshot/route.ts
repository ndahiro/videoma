import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { getSnapshotPath } from "@/lib/camera-store";
import { readFile } from "fs/promises";

/**
 * GET /api/cameras/{id}/snapshot — serve the latest captured frame as JPEG.
 * The detection worker refreshes it on every check; pass ?fresh=1 to grab a
 * new frame on demand (bounded by the snapshot timeout).
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { cameraId } = await params;
  try {
    if (req.nextUrl.searchParams.get("fresh") === "1") {
      const { captureSnapshot } = await import("@/lib/camera-store");
      await captureSnapshot(cameraId, guard.value.user.id);
    }
    const snapPath = await getSnapshotPath(cameraId, guard.value.user.id);
    if (!snapPath) {
      return NextResponse.json(
        { message: "No snapshot yet. The monitor will capture one on its next check." },
        { status: 404 },
      );
    }
    const buf = await readFile(snapPath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/cameras/{id}/snapshot] error:", err);
    return NextResponse.json({ message: "Snapshot unavailable." }, { status: 500 });
  }
}
