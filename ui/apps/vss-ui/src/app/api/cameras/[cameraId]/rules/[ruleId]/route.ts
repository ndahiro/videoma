import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { deleteCameraRule, updateCameraRule } from "@/lib/camera-store";

/**
 * PATCH  /api/cameras/{id}/rules/{ruleId} — rename / keywords / severity / cooldown / enable
 * DELETE /api/cameras/{id}/rules/{ruleId} — remove a rule
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ cameraId: string; ruleId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { ruleId } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const rule = await updateCameraRule(ruleId, guard.value.user.id, {
      name: typeof body?.name === "string" ? body.name : undefined,
      keywords:
        typeof body?.keywords === "string"
          ? body.keywords
          : Array.isArray(body?.keywords)
            ? body.keywords.join(", ")
            : undefined,
      severity: typeof body?.severity === "string" ? body.severity : undefined,
      cooldownSeconds:
        body?.cooldown_seconds === undefined ? undefined : Number(body.cooldown_seconds),
      enabled: typeof body?.enabled === "boolean" ? body.enabled : undefined,
    });
    if (!rule) {
      return NextResponse.json({ message: "Rule not found." }, { status: 404 });
    }
    return NextResponse.json({
      id: rule.id,
      camera_id: rule.cameraId,
      name: rule.name,
      keywords: rule.keywords,
      severity: rule.severity,
      cooldown_seconds: rule.cooldownSeconds,
      enabled: rule.enabled,
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to update rule." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ cameraId: string; ruleId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { ruleId } = await params;
  const deleted = await deleteCameraRule(ruleId, guard.value.user.id);
  if (!deleted) {
    return NextResponse.json({ message: "Rule not found." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
