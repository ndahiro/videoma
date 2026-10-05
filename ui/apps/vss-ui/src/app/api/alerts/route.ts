import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { listUserAlerts } from "@/lib/camera-store";
import { ensureCameraWorker } from "@/lib/camera-worker";

/**
 * GET /api/alerts — incident feed for the current user.
 * Query: ?camera_id=…&unread_only=true&limit=50
 * Returns { alerts: [...], unread_count }.
 */

export async function GET(req: NextRequest) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  try {
    ensureCameraWorker();
    const cameraId = req.nextUrl.searchParams.get("camera_id") ?? undefined;
    const unreadOnly = req.nextUrl.searchParams.get("unread_only") === "true";
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
    const { alerts, unreadCount } = await listUserAlerts(guard.value.user.id, {
      cameraId,
      unreadOnly,
      limit,
    });
    return NextResponse.json({
      alerts: alerts.map((a) => ({
        id: a.id,
        camera_id: a.cameraId,
        camera_name: a.cameraName,
        rule_id: a.ruleId,
        rule_name: a.ruleName,
        severity: a.severity,
        message: a.message,
        caption: a.caption,
        has_frame: a.hasFrame,
        read: a.read,
        created_at: a.createdAt.toISOString(),
      })),
      unread_count: unreadCount,
    });
  } catch (err) {
    console.error("[/api/alerts GET] error:", err);
    return NextResponse.json({ message: "Failed to list alerts." }, { status: 500 });
  }
}
