import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { markAlertRead } from "@/lib/camera-store";

/**
 * PATCH /api/alerts/{id} — acknowledge a single alert { read: true }.
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ alertId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { alertId } = await params;
  const body = await req.json().catch(() => ({}));
  if (body?.read !== true) {
    return NextResponse.json({ message: "Only { read: true } is supported." }, { status: 400 });
  }
  const marked = await markAlertRead(alertId, guard.value.user.id);
  if (!marked) {
    return NextResponse.json({ message: "Alert not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
