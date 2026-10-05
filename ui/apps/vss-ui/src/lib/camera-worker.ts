import { hostname } from "os";

/**
 * In-process live-camera monitor (server-only — never import from a client
 * component).
 *
 * Every `CAMERA_WORKER_INTERVAL_MS` the poller atomically claims up to
 * `CAMERA_WORKER_CONCURRENCY` due cameras (active + check interval elapsed)
 * and runs `checkCamera` on them in parallel: ffmpeg snapshot → VLM caption →
 * keyword rules → alerts. Claims use SELECT ... FOR UPDATE SKIP LOCKED, so
 * scaling to N replicas (`docker compose up --scale vss-ui=N`) multiplies
 * fleet capacity instead of duplicating checks. Failures are recorded on the
 * camera row, never thrown, so one dead stream can't stall the poller.
 *
 * Capacity per instance ≈ CONCURRENCY × (camera interval / tick interval),
 * e.g. 2 × (60s / 30s) ≈ 4 cameras per instance at defaults.
 *
 * Tune with:
 *   CAMERA_WORKER_ENABLED      — "0"/"false" disables the poller (default on)
 *   CAMERA_WORKER_INTERVAL_MS  — poll interval (default 30000)
 *   CAMERA_WORKER_CONCURRENCY  — parallel camera checks per instance (default 2)
 */

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : fallback;
}

function workerEnabled(): boolean {
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  const raw = (process.env.CAMERA_WORKER_ENABLED ?? "").toLowerCase();
  return raw !== "0" && raw !== "false";
}

const workerId =
  `camera-${hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

let started = false;
let tickInFlight = false;

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const { claimDueCameras, checkCamera } = await import("@/lib/camera-store");
    const concurrency = Math.max(1, envInt("CAMERA_WORKER_CONCURRENCY", 2));
    const batch = await claimDueCameras(workerId, concurrency).catch((err) => {
      console.error("[camera-worker] claiming due cameras failed:", err);
      return [];
    });
    await Promise.all(
      batch.map(async (camera) => {
        try {
          const fired = await checkCamera(camera.id);
          if (fired.length > 0) {
            console.log(
              `[camera-worker] ${camera.name}: ${fired.length} alert(s) fired`,
            );
          }
        } catch (err) {
          console.error(`[camera-worker] check failed for ${camera.id}:`, err);
        }
      }),
    );
  } finally {
    tickInFlight = false;
  }
}

/**
 * Start the poller once per process. Safe to call from any route handler;
 * subsequent calls are no-ops.
 */
export function ensureCameraWorker(): void {
  if (started || typeof window !== "undefined") return;
  if (!workerEnabled()) return;
  started = true;
  const intervalMs = Math.max(10000, envInt("CAMERA_WORKER_INTERVAL_MS", 30000));
  const timer = setInterval(() => {
    void tick().catch((err) => console.error("[camera-worker] tick failed:", err));
  }, intervalMs);
  timer.unref?.();
  console.log(`[camera-worker] started (${workerId}, every ${intervalMs}ms)`);
}
