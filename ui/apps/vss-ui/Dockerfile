# vss-ui — production image for the Videoma console (Next.js standalone).
#
# Designed to scale horizontally:
#   docker compose up --scale vss-ui=3
# Every replica serves HTTP + runs the embedding worker poller; Postgres
# SKIP LOCKED (lib/jobs) deals queue work to exactly one replica and Redis
# (REDIS_URL) shares rate-limit budgets. No container_name on purpose — it
# would prevent scaling. Uploaded video/frame objects live on the shared
# `vss-video-storage` volume mounted at VIDEO_UPLOAD_DIR on every replica
# (single-host compose). For multi-host, replace the volume with an
# S3-compatible mount (e.g. MinIO + s3fs/geesefs) and keep the same path.

FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /repo

# Workspace manifests first for a cached dependency layer.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY ui/apps/vss-ui/package.json ./ui/apps/vss-ui/package.json
COPY lib/db/package.json ./lib/db/package.json
COPY lib/api-client-react/package.json ./lib/api-client-react/package.json
COPY lib/api-spec/package.json ./lib/api-spec/package.json
COPY lib/api-zod/package.json ./lib/api-zod/package.json

# --ignore-scripts: the repo's pnpm overrides pin esbuild core while letting
# @esbuild/* platform packages float, so esbuild's postinstall version check
# fails on Linux. Nothing in the Next.js build or standalone runtime invokes
# the esbuild binary (no vite build step, no sharp/next-image usage), so
# skipping lifecycle scripts is safe here.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Sources needed for the vss-ui build.
COPY ui/apps/vss-ui ./ui/apps/vss-ui
COPY lib ./lib

ENV NEXT_TELEMETRY_DISABLED=1
# Build-time dummy DATABASE_URL: @workspace/db throws at import when the var
# is unset, and `next build` imports route modules during static analysis.
# The pg Pool connects lazily, so no connection is opened at build time;
# compose overrides this with the real DATABASE_URL at runtime.
ARG BUILD_DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=${BUILD_DATABASE_URL}
WORKDIR /repo/ui/apps/vss-ui
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Frame extraction (lib/video-store) shells out to ffmpeg at runtime, so the
# runtime image must ship the binary. Override the location with FFMPEG_PATH.
RUN apk add --no-cache ffmpeg

RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/videos/frames && chown -R app:app /data/videos
USER app

# Next.js standalone server (workspace paths preserved).
COPY --from=builder --chown=app:app /repo/ui/apps/vss-ui/.next/standalone ./
COPY --from=builder --chown=app:app /repo/ui/apps/vss-ui/.next/static ./ui/apps/vss-ui/.next/static
COPY --from=builder --chown=app:app /repo/ui/apps/vss-ui/public ./ui/apps/vss-ui/public

EXPOSE 3000
CMD ["node", "ui/apps/vss-ui/server.js"]
