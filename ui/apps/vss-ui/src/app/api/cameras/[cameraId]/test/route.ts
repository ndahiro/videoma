import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { applyRateLimit } from "@/lib/rate-limit";
import { captureSnapshot, getOwnedCamera } from "@/lib/camera-store";

/**
 * POST /api/cameras/{id}/test — grab one frame to verify the stream works.
 * Returns { ok: true } on success, { ok: false, message } otherwise.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const limited = await applyRateLimit(`camera-test:${guard.value.user.id}`, true);
  if (limited) return limited;

  const { cameraId } = await params;
  const camera = await getOwnedCamera(cameraId, guard.value.user.id);
  if (!camera) {
    return NextResponse.json({ message: "Camera not found." }, { status: 404 });
  }
  try {
    await captureSnapshot(cameraId, guard.value.user.id);
    return NextResponse.json({ ok: true, message: "Stream reachable — snapshot captured." });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Stream unreachable." },
      { status: 200 },
    );
  }
}
