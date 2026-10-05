import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { markAllAlertsRead } from "@/lib/camera-store";

/**
 * POST /api/alerts/read-all — acknowledge all unread alerts { camera_id? }.
 */

export async function POST(req: NextRequest) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => ({}));
  const cameraId =
    typeof body?.camera_id === "string" && body.camera_id.length > 0
      ? body.camera_id
      : undefined;
  const marked = await markAllAlertsRead(guard.value.user.id, cameraId);
  return NextResponse.json({ marked });
}
