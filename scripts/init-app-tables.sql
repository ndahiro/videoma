-- Videoma app tables (mirror of drizzle schema in lib/db/src/schema).
-- Applied manually because drizzle-kit push is version-gated in this env.
-- Safe to re-run: all statements are IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "videos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "filename" text NOT NULL,
  "stored_path" text,
  "file_size" integer,
  "duration_seconds" real,
  "width" integer,
  "height" integer,
  "upload_status" text NOT NULL DEFAULT 'uploaded',
  "embedding_status" text NOT NULL DEFAULT 'pending',
  "chunks_processed" integer DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "videos_user_id_idx" ON "videos" ("user_id");

-- Backfill for rows written before stored_path existed (no-op otherwise).
-- Stored names cannot be reconstructed, so legacy rows keep filename fallback.
-- (No UPDATE needed: readers fall back to filename when stored_path IS NULL.)

CREATE TABLE IF NOT EXISTS "video_embeddings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "video_id" uuid NOT NULL REFERENCES "videos"("id") ON DELETE CASCADE,
  "chunk_index" integer NOT NULL,
  "timestamp_start" real,
  "timestamp_end" real,
  "frame_path" text,
  "embedding" jsonb,
  "text_content" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "video_embeddings_video_id_idx" ON "video_embeddings" ("video_id");

CREATE TABLE IF NOT EXISTS "video_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "video_id" uuid NOT NULL REFERENCES "videos"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'queued',
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "locked_by" text,
  "locked_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "video_jobs_status_created_idx" ON "video_jobs" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "video_jobs_video_id_idx" ON "video_jobs" ("video_id");

CREATE TABLE IF NOT EXISTS "qa_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "video_id" uuid NOT NULL REFERENCES "videos"("id") ON DELETE CASCADE,
  "question" text NOT NULL,
  "answer" text,
  "sources" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "qa_history_video_id_idx" ON "qa_history" ("video_id");
