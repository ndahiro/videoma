import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { videosTable } from "./videos";

/**
 * video_jobs — Postgres-backed embedding job queue.
 *
 * Why a table instead of BullMQ/Redis: zero new dependencies (the repo
 * deliberately avoids extra npm packages for offline installs) and the queue
 * stays consistent with the videos it processes. Workers on any app instance
 * claim jobs with a single atomic UPDATE ... RETURNING over
 * `FOR UPDATE SKIP LOCKED`, so N replicas share work without a coordinator.
 *
 *   status: queued | running | done | error
 *   attempts/max_attempts: a failed run returns to `queued` until attempts
 *     run out, then parks in `error` for inspection/retry via /process.
 */
export const videoJobsTable = pgTable(
  "video_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videosTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    statusCreatedIdx: index("video_jobs_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    videoIdx: index("video_jobs_video_id_idx").on(table.videoId),
  }),
);

export type VideoJob = typeof videoJobsTable.$inferSelect;
export type InsertVideoJob = typeof videoJobsTable.$inferInsert;
