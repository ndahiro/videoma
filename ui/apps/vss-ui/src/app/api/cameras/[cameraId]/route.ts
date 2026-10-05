import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { deleteCamera, getOwnedCamera, toCameraDTO, updateCamera } from "@/lib/camera-store";

/**
 * GET    /api/cameras/{id} — single camera (owner only)
 * PATCH  /api/cameras/{id} — rename / relocate / pause / resume / interval
 * DELETE /api/cameras/{id} — remove camera, rules and alerts
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { cameraId } = await params;
  const camera = await getOwnedCamera(cameraId, guard.value.user.id);
  if (!camera) {
    return NextResponse.json({ message: "Camera not found." }, { status: 404 });
  }
  return NextResponse.json(toCameraDTO(camera));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { cameraId } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const camera = await updateCamera(cameraId, guard.value.user.id, {
      name: typeof body?.name === "string" ? body.name : undefined,
      location:
        body?.location === null
          ? null
          : typeof body?.location === "string"
            ? body.location
            : undefined,
      status: typeof body?.status === "string" ? body.status : undefined,
      checkIntervalSeconds:
        body?.check_interval_seconds === undefined
          ? undefined
          : Number(body.check_interval_seconds),
    });
    if (!camera) {
      return NextResponse.json({ message: "Camera not found." }, { status: 404 });
    }
    return NextResponse.json(toCameraDTO(camera));
  } catch (err) {
    console.error("[/api/cameras/{id} PATCH] error:", err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to update camera." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { cameraId } = await params;
  const deleted = await deleteCamera(cameraId, guard.value.user.id);
  if (!deleted) {
    return NextResponse.json({ message: "Camera not found." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
