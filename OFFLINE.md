# Running Videoma fully offline

Everything the app needs is bundled with the repo. No network calls at runtime.

## What was pre-downloaded

| Asset | Location | Source |
| --- | --- | --- |
| All `node_modules` | `node_modules/` (pnpm store at `~/.local/share/pnpm/store/v3`) | pnpm registry |
| Inter (4 weights) | `ui/apps/vss-ui/public/fonts/Inter-*.ttf` | Google Fonts |
| Fraunces (regular, medium, italic) | `ui/apps/vss-ui/public/fonts/Fraunces-*.ttf` | Google Fonts |
| JetBrains Mono (2 weights) | `ui/apps/vss-ui/public/fonts/JetBrainsMono-*.ttf` | Google Fonts |
| Postgres 16 image | Docker image `postgres:16-alpine` (cached locally) | Docker Hub |

The app loads fonts via `<link rel="stylesheet" href="/fonts/fonts.css">` — no Google Fonts CSS endpoint is hit.

## First-time setup (one-shot)

```powershell
# 1. Install JS deps (uses cached registry, no internet needed once store is populated)
pnpm install

# 2. Bring up the auth database
docker compose up -d vss-auth-db

# 3. Wait for Postgres to accept connections (usually <2s)
docker exec vss-auth-db pg_isready -U vss -d vss_auth

# 4. Create the users table
docker cp scripts/init-users.sql vss-auth-db:/tmp/init-users.sql
docker exec vss-auth-db psql -U vss -d vss_auth -f /tmp/init-users.sql

# 5. Point the UI at the local DB
#    (a one-time copy of .env into the app dir; already done in this checkout)
#    DATABASE_URL=postgresql://vss:vss_secret@localhost:5436/vss_auth
#    JWT_SECRET=...
```

`ui/apps/vss-ui/.env.local` is the file Next.js reads. It mirrors `.env` at the repo root.

## Day-to-day run

```powershell
# Database (only if not already running)
docker compose up -d vss-auth-db

# App
pnpm dev
# → http://localhost:3000
```

The login screen works immediately. New users register via `POST /api/auth/register`; existing users via `POST /api/auth/login`. Both return a JWT signed with `JWT_SECRET` and stored in the `users` table.

## Verifying the auth stack

```powershell
# Register
curl -Method POST -ContentType "application/json" `
  -Body '{"username":"alice","password":"hunter2"}' `
  http://localhost:3000/api/auth/register

# Login
curl -Method POST -ContentType "application/json" `
  -Body '{"username":"alice","password":"hunter2"}' `
  http://localhost:3000/api/auth/login

# Inspect user row
docker exec vss-auth-db psql -U vss -d vss_auth `
  -c "SELECT id, username, role, created_at FROM users;"
```

## Schema (currently provisioned)

```sql
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,                 -- bcrypt cost 10
  role          text NOT NULL DEFAULT 'user',
  created_at    timestamp NOT NULL DEFAULT now()
);
```

`pgcrypto` is enabled for `gen_random_uuid()`. The drizzle schema lives in `lib/db/src/schema/users.ts`; the SQL mirror in `scripts/init-users.sql` is what gets applied.

## Reset / nuke the database

```powershell
docker compose down -v          # drops the named volume, full wipe
docker compose up -d vss-auth-db
docker exec vss-auth-db psql -U vss -d vss_auth -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
docker cp scripts/init-users.sql vss-auth-db:/tmp/init-users.sql
docker exec vss-auth-db psql -U vss -d vss_auth -f /tmp/init-users.sql
```

## Adding new tables

1. Add a `lib/db/src/schema/<name>.ts` file using `pgTable`.
2. Re-export from `lib/db/src/schema/index.ts`.
3. Add the matching `CREATE TABLE` to `scripts/init-users.sql` (or a sibling `init-<name>.sql`).
4. Re-run the `docker cp` + `psql -f` step above.

The `pnpm --filter @workspace/db push` script is wired but currently fails because `drizzle-kit@0.31.10` requires `drizzle-orm >= 0.36` (project pins `0.31.4`). The hand-written SQL migration in `scripts/init-users.sql` is the source of truth until that gets resolved.

## Going *fully* offline (no registry)

To pnpm-install with no internet at all, pre-warm the pnpm store once on a connected machine:

```powershell
pnpm install          # populates ~/.local/share/pnpm/store/v3
```

Then copy the entire `node_modules/` and `~/.local/share/pnpm/store/v3` to the offline machine. `pnpm install --offline` will then resolve everything from the local cache.

For Docker, pre-pull the Postgres image once:

```powershell
docker pull postgres:16-alpine
```

The image is then cached in Docker's local store; `docker compose up` will not hit the registry.

## The two upstream NIM models

The upstream NVIDIA AI Blueprint defines exactly two model services — both packaged as NVIDIA NIM container images that pull from `nvcr.io`. Declarative specs live under [`models/`](models/):

| Role | Image | Spec |
| --- | --- | --- |
| VLM (vision-language) | `nvcr.io/nim/nvidia/cosmos3-reasoner:1.7` | [`models/vlm/`](models/vlm/) |
| LLM (reasoning) | `nvcr.io/nim/nvidia/nemotron-3.5-lightning-30b-a3b:2.0.9-variant` | [`models/llm/`](models/llm/) |

To pull and run on a GPU host with an NGC API key:

```powershell
$env:NGC_CLI_API_KEY = "nvapi-..."
.\models\pull.cmd                                     # pulls both images
docker compose -f models/llm/nemotron-3.5-lightning-30b-a3b.compose.yml up -d
docker compose -f models/vlm/cosmos3-reasoner.compose.yml                  up -d
```

Then point the app at them by editing `ui/apps/vss-ui/.env.local`:

```ini
LLM_BASE_URL=http://vss-llm-nim:8000/v1
LLM_NAME=nvidia/nemotron-3.5-lightning-30b-a3b
VLM_BASE_URL=http://vss-vlm-nim:8000/v1
VLM_NAME=cosmos3-reasoner
```

Or uncomment the `vss-vlm-nim` / `vss-llm-nim` blocks in the top-level `docker-compose.yml` and bring the whole stack up together.

Nothing is downloaded at `docker compose up` time; the pull is a separate, explicit step. The `.env` and any `.tar` archives are gitignored, so the NGC key never leaves your machine.

## vLLM alternative (single 24 GB GPU, no NGC key)

The upstream `deployments/.../config.yml` already declares `openai_llm`, `openai_vlm`, and `vllm_vlm` profiles that talk to any OpenAI-compatible endpoint. That means you can run the same two models via **vLLM** (public HF weights, no NGC key, fits on a single 24 GB GPU).

| Role | HF model id | Min VRAM |
| --- | --- | --- |
| VLM | `nvidia/Cosmos-Reason1-7B` | 24 GB |
| LLM | `nvidia/NVIDIA-Nemotron-Nano-9B-v2-FP8` | 16 GB |

This is the **default** for this repo (see `.env`). Bring it up on a GPU host:

```powershell
docker compose up -d vss-llm-vllm vss-vlm-vllm
# vLLM downloads weights on first start (~25 GB total), then caches in the
# vllm_llm_cache / vllm_vlm_cache Docker volumes.

docker compose up -d vss-agent
# vss-agent uses LLM_MODEL_TYPE=openai + VLM_MODEL_TYPE=openai from .env,
# which routes to the two vLLM containers.

# To pre-warm weights offline (recommended):
docker volume create vllm_llm_cache
docker volume create vllm_vlm_cache
docker run --rm -v vllm_llm_cache:/cache -e HF_TOKEN=... huggingface/cli:latest \
  hf download nvidia/NVIDIA-Nemotron-Nano-9B-v2-FP8 --local-dir /cache/...
# (see models/vllm/pull.sh for the full pre-download)
```

Switching to NIMs is a one-line `.env` change + uncommenting two compose blocks. The agent's `config.yml` already supports both — no code change.

## Full GPU-server deployment (video ingestion → search → summary)

1. **On the GPU host**: clone this repo, copy `.env` to `ui/apps/vss-ui/.env.local`, run `pnpm install --offline`.
2. **Start the auth DB** (PostgreSQL):
   ```bash
   docker compose up -d vss-auth-db
   docker cp scripts/init-users.sql vss-auth-db:/tmp/init-users.sql
   docker exec vss-auth-db psql -U vss -d vss_auth -f /tmp/init-users.sql
   ```
3. **Start the model stack** (vLLM default; or uncomment NIM blocks):
   ```bash
   docker compose up -d vss-llm-vllm vss-vlm-vllm
   ```
4. **Start the vss-agent** (Python backend; first build is ~10 min from `agent/docker/Dockerfile`):
   ```bash
   docker compose up -d --build vss-agent
   # wait for: curl -fs http://localhost:8000/health
   ```
5. **(Recommended for real video upload) Start VST**:
   uncomment the `vst:` block in `docker-compose.yml`, then:
   ```bash
   docker compose up -d vst
   ```
6. **Start the UI**:
   ```bash
   pnpm dev
   # open http://localhost:3000
   ```
7. **Sign in** with `admin / VideomaAdmin#2026` (or register a new account) and upload a video.

The `/api/videos`, `/api/stats`, `/api/jobs` routes in the UI proxy to the vss-agent via `src/lib/agent.ts`. If the agent is down, those routes return 503 with a clear message instead of crashing the page.
