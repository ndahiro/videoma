import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { videosTable } from "./videos";

/**
 * Live-camera module tables.
 *
 * cameras — user-configured RTSP sources polled by the camera worker
 *   (ui/apps/vss-ui/src/lib/camera-worker.ts). Snapshots are captured with
 *   the system ffmpeg; the full RTSP URL (often containing credentials) is
 *   stored here but NEVER returned by APIs — see maskRtspUrl().
 * camera_rules — keyword incident rules per camera. A rule fires when any of
 *   its comma-separated keywords appears in the VLM frame caption.
 * alerts — fired incidents feed. `read` tracks acknowledgement in the UI.
 */

export const camerasTable = pgTable(
  "cameras",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rtspUrl: text("rtsp_url").notNull(),
    location: text("location"),
    // active | paused | error
    status: text("status").notNull().default("active"),
    checkIntervalSeconds: integer("check_interval_seconds").notNull().default(60),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastSnapshotPath: text("last_snapshot_path"),
    lastError: text("last_error"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    // Distributed claim for the monitor poller: exactly one app instance owns
    // a check. Stale locks (crashed worker) are re-claimable after 5 minutes.
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("cameras_user_id_idx").on(table.userId),
  }),
);

export const cameraRulesTable = pgTable(
  "camera_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cameraId: uuid("camera_id")
      .notNull()
      .references(() => camerasTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Comma-separated keywords, matched case-insensitively against captions.
    keywords: text("keywords").notNull().default(""),
    // info | warning | critical
    severity: text("severity").notNull().default("warning"),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(300),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    cameraIdx: index("camera_rules_camera_id_idx").on(table.cameraId),
    userIdx: index("camera_rules_user_id_idx").on(table.userId),
  }),
);

export const alertsTable = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cameraId: uuid("camera_id").references(() => camerasTable.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").references(() => cameraRulesTable.id, { onDelete: "set null" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    videoId: uuid("video_id").references(() => videosTable.id, { onDelete: "set null" }),
    // info | warning | critical
    severity: text("severity").notNull().default("warning"),
    message: text("message").notNull(),
    caption: text("caption"),
    framePath: text("frame_path"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index("alerts_user_id_created_idx").on(table.userId, table.createdAt),
    cameraIdx: index("alerts_camera_id_idx").on(table.cameraId),
  }),
);

export type Camera = typeof camerasTable.$inferSelect;
export type InsertCamera = typeof camerasTable.$inferInsert;
export type CameraRule = typeof cameraRulesTable.$inferSelect;
export type InsertCameraRule = typeof cameraRulesTable.$inferInsert;
export type Alert = typeof alertsTable.$inferSelect;
export type InsertAlert = typeof alertsTable.$inferInsert;
