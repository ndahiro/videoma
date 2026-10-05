import { index, integer, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const videosTable = pgTable(
  "videos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    // On-disk object name. Filenames are namespaced per video
    // (`<videoId>_<safeName>`) so concurrent uploads of "clip.mp4" by
    // different users never overwrite each other. Null on rows written
    // before this column existed — readers fall back to filename.
    storedPath: text("stored_path"),
    fileSize: integer("file_size"),
    durationSeconds: real("duration_seconds"),
    width: integer("width"),
    height: integer("height"),
    uploadStatus: text("upload_status").notNull().default("uploaded"),
    embeddingStatus: text("embedding_status").notNull().default("pending"),
    chunksProcessed: integer("chunks_processed").default(0),
    // Total frames extracted for the current embedding run. Together with
    // chunks_processed this drives the UI progress bar (progress =
    // chunks_processed / total_chunks). Reset to 0 at the start of each run.
    totalChunks: integer("total_chunks").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("videos_user_id_idx").on(table.userId),
  }),
);

export const videoEmbeddingsTable = pgTable(
  "video_embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videosTable.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    timestampStart: real("timestamp_start"),
    timestampEnd: real("timestamp_end"),
    framePath: text("frame_path"),
    embedding: jsonb("embedding"),
    textContent: text("text_content"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    videoIdx: index("video_embeddings_video_id_idx").on(table.videoId),
  }),
);

export type Video = typeof videosTable.$inferSelect;
export type InsertVideo = typeof videosTable.$inferInsert;
export type VideoEmbedding = typeof videoEmbeddingsTable.$inferSelect;
export type InsertVideoEmbedding = typeof videoEmbeddingsTable.$inferInsert;
