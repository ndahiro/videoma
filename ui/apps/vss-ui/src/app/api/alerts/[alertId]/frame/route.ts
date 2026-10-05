import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { getAlertFramePath } from "@/lib/camera-store";
import { readFile } from "fs/promises";

/**
 * GET /api/alerts/{id}/frame — the frame captured when the alert fired.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ alertId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { alertId } = await params;
  const framePath = await getAlertFramePath(alertId, guard.value.user.id);
  if (!framePath) {
    return NextResponse.json({ message: "Frame not found." }, { status: 404 });
  }
  const buf = await readFile(framePath);
  return new NextResponse(buf, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" },
  });
}
