import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { applyRateLimit } from "@/lib/rate-limit";
import { createCamera, listUserCameras, maskRtspUrl, toCameraDTO } from "@/lib/camera-store";
import { ensureCameraWorker } from "@/lib/camera-worker";

/**
 * GET  /api/cameras — list the current user's live cameras
 * POST /api/cameras — configure a new live camera { name, rtsp_url, location?, check_interval_seconds? }
 */

export async function GET(req: NextRequest) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  try {
    ensureCameraWorker();
    const cameras = await listUserCameras(guard.value.user.id);
    return NextResponse.json(cameras.map(toCameraDTO));
  } catch (err) {
    console.error("[/api/cameras GET] error:", err);
    return NextResponse.json({ message: "Failed to list cameras." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const limited = await applyRateLimit(`cameras:${guard.value.user.id}`, true);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const camera = await createCamera(guard.value.user.id, {
      name: typeof body?.name === "string" ? body.name : "",
      rtspUrl: typeof body?.rtsp_url === "string" ? body.rtsp_url : "",
      location: typeof body?.location === "string" ? body.location : undefined,
      checkIntervalSeconds:
        Number.isFinite(Number(body?.check_interval_seconds))
          ? Number(body.check_interval_seconds)
          : undefined,
    });
    ensureCameraWorker();
    return NextResponse.json(
      { ...toCameraDTO(camera), rtsp_url: maskRtspUrl(body.rtsp_url) },
      { status: 201 },
    );
  } catch (err) {
    console.error("[/api/cameras POST] error:", err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to add camera." },
      { status: 400 },
    );
  }
}
