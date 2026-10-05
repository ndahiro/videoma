-- ============================================================================
-- VIDEOMA — auth + SaaS schema
-- Idempotent: safe to run against a fresh database or an existing install.
-- Apply with:
--   docker cp scripts/init-users.sql vss-auth-db:/tmp/init-users.sql
--   docker exec vss-auth-db psql -U vss -d vss_auth -f /tmp/init-users.sql
-- (or `pnpm --filter @workspace/db run push` to let drizzle-kit sync instead)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- users — account + profile + cached subscription state
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "role" text NOT NULL DEFAULT 'user',
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Columns added by the SaaS layer (profiles + billing cache)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "full_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "website" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan_id" text NOT NULL DEFAULT 'free';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_status" text NOT NULL DEFAULT 'none';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "current_period_end" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "unsubscribed" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "users_plan_id_idx" ON "users" ("plan_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- stripe_customers — one Stripe customer per user
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "stripe_customers" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "stripe_customer_id" text UNIQUE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- subscriptions — local mirror, written by the Stripe webhook
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" text PRIMARY KEY,                                    -- Stripe sub_...
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "plan_id" text NOT NULL DEFAULT 'free',
  "price_id" text,
  "product_id" text,
  "customer_id" text,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "subscriptions_user_id_idx" ON "subscriptions" ("user_id");
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" ("status");

-- ─────────────────────────────────────────────────────────────────────────────
-- stripe_events — webhook idempotency log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "stripe_events" (
  "id" text PRIMARY KEY,
  "type" text NOT NULL,
  "payload" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- usage_events — metered product usage (minutes ingested / AI queries)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,                                     -- ingest|search|query|summarize|process
  "unit" text NOT NULL,                                     -- minutes|queries|jobs
  "quantity" integer NOT NULL DEFAULT 1,
  "video_id" text,
  "meta" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "usage_events_user_created_idx"
  ON "usage_events" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "usage_events_kind_idx" ON "usage_events" ("kind");

-- ─────────────────────────────────────────────────────────────────────────────
-- contact_requests — marketing contact form submissions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contact_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "first_name" text,
  "last_name" text,
  "email" text,
  "phone" text,
  "company_name" text,
  "message_body" text,
  "source" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- Hot-path indexes for high-concurrency reads.
-- The videos / video_embeddings / qa_history tables are synced via
-- `pnpm --filter @workspace/db run push` (drizzle-kit), which creates these
-- from the schema; the block below backfills them when the tables already
-- exist (e.g. older deployments), and no-ops otherwise.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.videos') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "videos_user_id_idx" ON "videos" ("user_id");
  END IF;
  IF to_regclass('public.video_embeddings') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "video_embeddings_video_id_idx" ON "video_embeddings" ("video_id");
  END IF;
  IF to_regclass('public.qa_history') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "qa_history_video_id_idx" ON "qa_history" ("video_id");
  END IF;
END
$$;
