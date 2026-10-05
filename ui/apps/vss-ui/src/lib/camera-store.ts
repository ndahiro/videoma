import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import ffmpegStaticPath from "ffmpeg-static";
import {
  db,
  alertsTable,
  camerasTable,
  cameraRulesTable,
  and,
  desc,
  eq,
  gte,
  sql,
} from "@/lib/db";
import { captionImage } from "@/lib/hf";

const execFileAsync = promisify(execFile);

const VIDEO_UPLOAD_DIR =
  process.env.VIDEO_UPLOAD_DIR || join(tmpdir(), "videoma_videos");
const CAMERA_DIR = join(VIDEO_UPLOAD_DIR, "cameras");

function cameraSnapshotTimeoutMs(): number {
  const raw = Number(process.env.CAMERA_SNAPSHOT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30_000;
}

function cameraMaxFailures(): number {
  const raw = Number(process.env.CAMERA_MAX_FAILURES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3;
}

function resolveFfmpegBin(): string {
  const fromEnv = (process.env.FFMPEG_PATH || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (fromEnv) return fromEnv;
  if (
    typeof ffmpegStaticPath === "string" &&
    ffmpegStaticPath &&
    existsSync(ffmpegStaticPath)
  ) {
    return ffmpegStaticPath;
  }
  return "ffmpeg";
}

export interface CameraRecord {
  id: string;
  name: string;
  location: string | null;
  status: string;
  checkIntervalSeconds: number;
  lastCheckedAt: Date | null;
  hasSnapshot: boolean;
  lastError: string | null;
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CameraRuleRecord {
  id: string;
  cameraId: string;
  name: string;
  keywords: string[];
  severity: string;
  cooldownSeconds: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertRecord {
  id: string;
  cameraId: string | null;
  cameraName: string | null;
  ruleId: string | null;
  ruleName: string | null;
  severity: string;
  message: string;
  caption: string | null;
  hasFrame: boolean;
  read: boolean;
  createdAt: Date;
}

/** Mask credentials in an RTSP URL before it leaves the server. */
export function maskRtspUrl(url: string): string {
  return url.replace(/:\/\/([^/@:]+):([^/@]*)@/g, "://***@");
}

/** Normalize a comma-separated keyword string into a clean list. */
export function parseKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
}

/** JSON shape served by the camera APIs (never includes the RTSP URL). */
export function toCameraDTO(c: CameraRecord) {
  return {
    id: c.id,
    name: c.name,
    location: c.location,
    status: c.status,
    check_interval_seconds: c.checkIntervalSeconds,
    last_checked_at: c.lastCheckedAt?.toISOString() ?? null,
    has_snapshot: c.hasSnapshot,
    last_error: c.lastError,
    consecutive_failures: c.consecutiveFailures,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

function toCameraRecord(row: typeof camerasTable.$inferSelect): CameraRecord {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    status: row.status,
    checkIntervalSeconds: row.checkIntervalSeconds,
    lastCheckedAt: row.lastCheckedAt,
    hasSnapshot: Boolean(row.lastSnapshotPath),
    lastError: row.lastError,
    consecutiveFailures: row.consecutiveFailures,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRuleRecord(row: typeof cameraRulesTable.$inferSelect): CameraRuleRecord {
  return {
    id: row.id,
    cameraId: row.cameraId,
    name: row.name,
    keywords: parseKeywords(row.keywords ?? ""),
    severity: row.severity,
    cooldownSeconds: row.cooldownSeconds,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listUserCameras(userId: string): Promise<CameraRecord[]> {
  const rows = await db
    .select()
    .from(camerasTable)
    .where(eq(camerasTable.userId, userId as any))
    .orderBy(desc(camerasTable.createdAt));
  return rows.map(toCameraRecord);
}

/** Null for missing AND foreign rows alike (no enumeration). */
export async function getOwnedCamera(
  cameraId: string,
  userId: string,
): Promise<CameraRecord | null> {
  const rows = await db
    .select()
    .from(camerasTable)
    .where(and(eq(camerasTable.id, cameraId as any), eq(camerasTable.userId, userId as any)))
    .limit(1);
  if (rows.length === 0) return null;
  return toCameraRecord(rows[0]);
}

/** Raw row including the RTSP URL — server-side use only, never serialize. */
async function getOwnedCameraRow(
  cameraId: string,
  userId: string,
): Promise<typeof camerasTable.$inferSelect | null> {
  const rows = await db
    .select()
    .from(camerasTable)
    .where(and(eq(camerasTable.id, cameraId as any), eq(camerasTable.userId, userId as any)))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

const RTSP_SCHEMES = ["rtsp://", "rtsps://", "http://", "https://"];

export function validateRtspUrl(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed.length === 0) return "RTSP URL is required.";
  if (trimmed.length > 2048) return "RTSP URL is too long (max 2048 characters).";
  const lower = trimmed.toLowerCase();
  if (!RTSP_SCHEMES.some((s) => lower.startsWith(s))) {
    return "URL must start with rtsp://, rtsps://, http:// or https://.";
  }
  if (/\s/.test(trimmed)) return "URL must not contain whitespace.";
  return null;
}

export async function createCamera(
  userId: string,
  input: { name: string; rtspUrl: string; location?: string; checkIntervalSeconds?: number },
): Promise<CameraRecord> {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Camera name is required.");
  const urlError = validateRtspUrl(input.rtspUrl);
  if (urlError) throw new Error(urlError);
  const interval = Math.min(
    3600,
    Math.max(15, Math.floor(input.checkIntervalSeconds ?? 60)),
  );
  const [row] = await db
    .insert(camerasTable)
    .values({
      userId: userId as any,
      name,
      rtspUrl: input.rtspUrl.trim(),
      location: input.location?.trim().slice(0, 200) || null,
      checkIntervalSeconds: interval,
    })
    .returning();
  return toCameraRecord(row);
}

export async function updateCamera(
  cameraId: string,
  userId: string,
  patch: { name?: string; location?: string | null; status?: string; checkIntervalSeconds?: number },
): Promise<CameraRecord | null> {
  const owned = await getOwnedCamera(cameraId, userId);
  if (!owned) return null;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 120);
    if (!name) throw new Error("Camera name is required.");
    update.name = name;
  }
  if (patch.location !== undefined) {
    update.location = patch.location?.trim().slice(0, 200) || null;
  }
  if (patch.status !== undefined) {
    if (!["active", "paused"].includes(patch.status)) {
      throw new Error("Status must be active or paused.");
    }
    update.status = patch.status;
    update.lastError = null;
    update.consecutiveFailures = 0;
  }
  if (patch.checkIntervalSeconds !== undefined) {
    update.checkIntervalSeconds = Math.min(
      3600,
      Math.max(15, Math.floor(patch.checkIntervalSeconds)),
    );
  }
  const [row] = await db
    .update(camerasTable)
    .set(update)
    .where(and(eq(camerasTable.id, cameraId as any), eq(camerasTable.userId, userId as any)))
    .returning();
  return row ? toCameraRecord(row) : null;
}

export async function deleteCamera(cameraId: string, userId: string): Promise<boolean> {
  const owned = await getOwnedCameraRow(cameraId, userId);
  if (!owned) return false;
  await db.delete(cameraRulesTable).where(eq(cameraRulesTable.cameraId, cameraId as any));
  await db.delete(alertsTable).where(eq(alertsTable.cameraId, cameraId as any));
  await db
    .delete(camerasTable)
    .where(and(eq(camerasTable.id, cameraId as any), eq(camerasTable.userId, userId as any)));
  if (owned.lastSnapshotPath) {
    try {
      await unlink(owned.lastSnapshotPath);
    } catch {}
  }
  return true;
}

// --- Rules ---

const SEVERITIES = ["info", "warning", "critical"];

export async function listCameraRules(cameraId: string, userId: string): Promise<CameraRuleRecord[]> {
  const owned = await getOwnedCamera(cameraId, userId);
  if (!owned) return [];
  const rows = await db
    .select()
    .from(cameraRulesTable)
    .where(eq(cameraRulesTable.cameraId, cameraId as any))
    .orderBy(desc(cameraRulesTable.createdAt));
  return rows.map(toRuleRecord);
}

export async function createCameraRule(
  cameraId: string,
  userId: string,
  input: { name: string; keywords: string; severity?: string; cooldownSeconds?: number },
): Promise<CameraRuleRecord | null> {
  const owned = await getOwnedCamera(cameraId, userId);
  if (!owned) return null;
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Rule name is required.");
  const keywords = parseKeywords(input.keywords ?? "");
  if (keywords.length === 0) throw new Error("At least one keyword is required.");
  const severity = (input.severity ?? "warning").toLowerCase();
  if (!SEVERITIES.includes(severity)) throw new Error("Severity must be info, warning or critical.");
  const [row] = await db
    .insert(cameraRulesTable)
    .values({
      cameraId: cameraId as any,
      userId: userId as any,
      name,
      keywords: keywords.join(", "),
      severity,
      cooldownSeconds: Math.min(86400, Math.max(0, Math.floor(input.cooldownSeconds ?? 300))),
    })
    .returning();
  return toRuleRecord(row);
}

export async function updateCameraRule(
  ruleId: string,
  userId: string,
  patch: { name?: string; keywords?: string; severity?: string; cooldownSeconds?: number; enabled?: boolean },
): Promise<CameraRuleRecord | null> {
  const rows = await db
    .select()
    .from(cameraRulesTable)
    .where(and(eq(cameraRulesTable.id, ruleId as any), eq(cameraRulesTable.userId, userId as any)))
    .limit(1);
  if (rows.length === 0) return null;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 120);
    if (!name) throw new Error("Rule name is required.");
    update.name = name;
  }
  if (patch.keywords !== undefined) {
    const keywords = parseKeywords(patch.keywords);
    if (keywords.length === 0) throw new Error("At least one keyword is required.");
    update.keywords = keywords.join(", ");
  }
  if (patch.severity !== undefined) {
    const severity = patch.severity.toLowerCase();
    if (!SEVERITIES.includes(severity)) throw new Error("Severity must be info, warning or critical.");
    update.severity = severity;
  }
  if (patch.cooldownSeconds !== undefined) {
    update.cooldownSeconds = Math.min(86400, Math.max(0, Math.floor(patch.cooldownSeconds)));
  }
  if (patch.enabled !== undefined) update.enabled = Boolean(patch.enabled);
  const [row] = await db
    .update(cameraRulesTable)
    .set(update)
    .where(and(eq(cameraRulesTable.id, ruleId as any), eq(cameraRulesTable.userId, userId as any)))
    .returning();
  return row ? toRuleRecord(row) : null;
}

export async function deleteCameraRule(ruleId: string, userId: string): Promise<boolean> {
  const rows = await db
    .delete(cameraRulesTable)
    .where(and(eq(cameraRulesTable.id, ruleId as any), eq(cameraRulesTable.userId, userId as any)))
    .returning({ id: cameraRulesTable.id });
  return rows.length > 0;
}

// --- Snapshots ---

async function ensureCameraDir(cameraId: string): Promise<string> {
  const dir = join(CAMERA_DIR, cameraId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Grab one frame from the camera stream. Throws with a short, user-safe
 * message on failure (the raw ffmpeg stderr may contain credentials).
 */
export async function captureSnapshot(cameraId: string, userId: string): Promise<string> {
  const row = await getOwnedCameraRow(cameraId, userId);
  if (!row) throw new Error("Camera not found.");
  const dir = await ensureCameraDir(cameraId);
  const outPath = join(dir, "latest.jpg");
  const tmpPath = join(dir, "latest.tmp.jpg");
  const bin = resolveFfmpegBin();
  try {
    await execFileAsync(
      bin,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-rtsp_transport",
        "tcp",
        "-i",
        row.rtspUrl,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        "-y",
        tmpPath,
      ],
      { timeout: cameraSnapshotTimeoutMs(), maxBuffer: 16 * 1024 * 1024, windowsHide: true },
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      throw new Error(`ffmpeg executable not found (tried "${bin}").`);
    }
    throw new Error("Could not grab a frame: stream unreachable or timed out.");
  }
  try {
    const buf = await readFile(tmpPath);
    if (buf.length === 0) throw new Error("Empty frame.");
    await writeFile(outPath, buf);
    await unlink(tmpPath).catch(() => {});
  } catch {
    throw new Error("Could not grab a frame: stream unreachable or timed out.");
  }
  await db
    .update(camerasTable)
    .set({ lastSnapshotPath: outPath, updatedAt: new Date() })
    .where(eq(camerasTable.id, cameraId as any));
  return outPath;
}

export async function getSnapshotPath(cameraId: string, userId: string): Promise<string | null> {
  const row = await getOwnedCameraRow(cameraId, userId);
  if (!row?.lastSnapshotPath) return null;
  return existsSync(row.lastSnapshotPath) ? row.lastSnapshotPath : null;
}

// --- Detection ---

/**
 * Atomically claim up to `limit` due cameras for `workerId`.
 *
 * Exactly one app instance wins each camera even with N replicas behind the
 * load balancer (same pattern as the video job queue): the inner SELECT skips
 * rows locked by concurrent claimants, and locks older than 5 minutes are
 * treated as orphaned (crashed worker) and re-claimed. Oldest checks first
 * so a fleet of cameras shares monitor time fairly.
 */
export async function claimDueCameras(
  workerId: string,
  limit = 10,
): Promise<Array<typeof camerasTable.$inferSelect>> {
  const result = await db.execute(sql`
    UPDATE cameras AS c
    SET locked_by = ${workerId},
        locked_at = NOW(),
        updated_at = NOW()
    WHERE c.id IN (
      SELECT id FROM cameras
      WHERE status = 'active'
        AND (
          last_checked_at IS NULL
          OR last_checked_at < NOW() - (check_interval_seconds || ' seconds')::interval
        )
        AND (
          locked_at IS NULL
          OR locked_at < NOW() - INTERVAL '5 minutes'
        )
      ORDER BY last_checked_at NULLS FIRST
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING c.*
  `);
  const rows = (result as unknown as { rows: Array<typeof camerasTable.$inferSelect> }).rows;
  return rows ?? [];
}

/** Release a worker's claim (called after every check, success or failure). */
async function releaseCameraClaim(cameraId: string): Promise<void> {
  try {
    await db
      .update(camerasTable)
      .set({ lockedBy: null, lockedAt: null, updatedAt: new Date() })
      .where(eq(camerasTable.id, cameraId as any));
  } catch (err) {
    console.warn(`[camera-store] claim release failed for ${cameraId}:`, err);
  }
}

async function ruleOnCooldown(ruleId: string, cooldownSeconds: number): Promise<boolean> {
  if (cooldownSeconds <= 0) return false;
  const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
  const rows = await db
    .select({ id: alertsTable.id })
    .from(alertsTable)
    .where(and(eq(alertsTable.ruleId, ruleId as any), gte(alertsTable.createdAt, cutoff)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Run one detection pass for a camera: snapshot → caption → keyword rules →
 * alerts. Returns the alerts fired. Never throws — failures are recorded on
 * the camera row (error status after N consecutive failures).
 */
export async function checkCamera(cameraId: string): Promise<AlertRecord[]> {
  const rows = await db
    .select()
    .from(camerasTable)
    .where(eq(camerasTable.id, cameraId as any))
    .limit(1);
  if (rows.length === 0 || rows[0].status !== "active") return [];
  const camera = rows[0];
  const fired: AlertRecord[] = [];

  try {
    const snapshotPath = await captureSnapshot(camera.id, camera.userId as string);
    const buf = await readFile(snapshotPath);
    const caption = await captionImage(`data:image/jpeg;base64,${buf.toString("base64")}`);
    const captionLower = caption.toLowerCase();

    const rules = await db
      .select()
      .from(cameraRulesTable)
      .where(and(eq(cameraRulesTable.cameraId, camera.id), eq(cameraRulesTable.enabled, true)));

    for (const rule of rules) {
      const keywords = parseKeywords(rule.keywords ?? "");
      const hit = keywords.find((k) => captionLower.includes(k));
      if (!hit) continue;
      if (await ruleOnCooldown(rule.id, rule.cooldownSeconds)) continue;
      const [alert] = await db
        .insert(alertsTable)
        .values({
          cameraId: camera.id as any,
          ruleId: rule.id as any,
          userId: camera.userId as any,
          severity: rule.severity,
          message: `${rule.name}: saw "${hit}" on ${camera.name}`,
          caption,
          framePath: snapshotPath,
        })
        .returning();
      fired.push({
        id: alert.id,
        cameraId: camera.id,
        cameraName: camera.name,
        ruleId: rule.id,
        ruleName: rule.name,
        severity: alert.severity,
        message: alert.message,
        caption,
        hasFrame: true,
        read: false,
        createdAt: alert.createdAt,
      });
    }

    await db
      .update(camerasTable)
      .set({
        lastCheckedAt: new Date(),
        lastError: null,
        consecutiveFailures: 0,
        status: "active",
        lockedBy: null,
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(camerasTable.id, camera.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failures = (camera.consecutiveFailures ?? 0) + 1;
    await db
      .update(camerasTable)
      .set({
        lastCheckedAt: new Date(),
        lastError: message.slice(0, 500),
        consecutiveFailures: failures,
        status: failures >= cameraMaxFailures() ? "error" : "active",
        lockedBy: null,
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(camerasTable.id, camera.id));
  }
  // NOTE: both paths above clear locked_by/locked_at. Rows orphaned by a
  // crashed process are re-claimed by the 5-minute stale-lock rule, and the
  // best-effort release below covers any future early-return added above.
  await releaseCameraClaim(camera.id);
  return fired;
}

// --- Alerts ---

export async function listUserAlerts(
  userId: string,
  options: { cameraId?: string; unreadOnly?: boolean; limit?: number } = {},
): Promise<{ alerts: AlertRecord[]; unreadCount: number }> {
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 50)));
  const conditions = [eq(alertsTable.userId, userId as any)];
  if (options.cameraId) {
    conditions.push(eq(alertsTable.cameraId, options.cameraId as any));
  }
  if (options.unreadOnly) {
    conditions.push(eq(alertsTable.read, false));
  }
  const rows = await db
    .select({
      alert: alertsTable,
      cameraName: camerasTable.name,
      ruleName: cameraRulesTable.name,
    })
    .from(alertsTable)
    .leftJoin(camerasTable, eq(alertsTable.cameraId, camerasTable.id))
    .leftJoin(cameraRulesTable, eq(alertsTable.ruleId, cameraRulesTable.id))
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(desc(alertsTable.createdAt))
    .limit(limit);

  const unread = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertsTable)
    .where(and(eq(alertsTable.userId, userId as any), eq(alertsTable.read, false)));

  return {
    alerts: rows.map((r) => ({
      id: r.alert.id,
      cameraId: r.alert.cameraId,
      cameraName: r.cameraName,
      ruleId: r.alert.ruleId,
      ruleName: r.ruleName,
      severity: r.alert.severity,
      message: r.alert.message,
      caption: r.alert.caption,
      hasFrame: Boolean(r.alert.framePath),
      read: r.alert.read,
      createdAt: r.alert.createdAt,
    })),
    unreadCount: Number(unread[0]?.count ?? 0),
  };
}

export async function markAlertRead(alertId: string, userId: string): Promise<boolean> {
  const rows = await db
    .update(alertsTable)
    .set({ read: true })
    .where(and(eq(alertsTable.id, alertId as any), eq(alertsTable.userId, userId as any)))
    .returning({ id: alertsTable.id });
  return rows.length > 0;
}

export async function markAllAlertsRead(userId: string, cameraId?: string): Promise<number> {
  const conditions = [eq(alertsTable.userId, userId as any), eq(alertsTable.read, false)];
  if (cameraId) conditions.push(eq(alertsTable.cameraId, cameraId as any));
  const rows = await db
    .update(alertsTable)
    .set({ read: true })
    .where(and(...conditions))
    .returning({ id: alertsTable.id });
  return rows.length;
}

export async function getAlertFramePath(alertId: string, userId: string): Promise<string | null> {
  const rows = await db
    .select({ framePath: alertsTable.framePath })
    .from(alertsTable)
    .where(and(eq(alertsTable.id, alertId as any), eq(alertsTable.userId, userId as any)))
    .limit(1);
  const p = rows[0]?.framePath;
  if (!p) return null;
  return existsSync(p) ? p : null;
}
