import { NextRequest, NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-guard";
import { createCameraRule, getOwnedCamera, listCameraRules } from "@/lib/camera-store";

/**
 * GET  /api/cameras/{id}/rules — list incident rules for a camera
 * POST /api/cameras/{id}/rules — add a rule { name, keywords, severity?, cooldown_seconds? }
 */

function toRuleDTO(r: {
  id: string;
  cameraId: string;
  name: string;
  keywords: string[];
  severity: string;
  cooldownSeconds: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    camera_id: r.cameraId,
    name: r.name,
    keywords: r.keywords,
    severity: r.severity,
    cooldown_seconds: r.cooldownSeconds,
    enabled: r.enabled,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { cameraId } = await params;
  if (!(await getOwnedCamera(cameraId, guard.value.user.id))) {
    return NextResponse.json({ message: "Camera not found." }, { status: 404 });
  }
  const rules = await listCameraRules(cameraId, guard.value.user.id);
  return NextResponse.json(rules.map(toRuleDTO));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> },
) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  const { cameraId } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const rule = await createCameraRule(cameraId, guard.value.user.id, {
      name: typeof body?.name === "string" ? body.name : "",
      keywords:
        typeof body?.keywords === "string"
          ? body.keywords
          : Array.isArray(body?.keywords)
            ? body.keywords.join(", ")
            : "",
      severity: typeof body?.severity === "string" ? body.severity : undefined,
      cooldownSeconds:
        body?.cooldown_seconds === undefined ? undefined : Number(body.cooldown_seconds),
    });
    if (!rule) {
      return NextResponse.json({ message: "Camera not found." }, { status: 404 });
    }
    return NextResponse.json(toRuleDTO(rule), { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to add rule." },
      { status: 400 },
    );
  }
}
