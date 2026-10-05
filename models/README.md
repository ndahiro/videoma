# `models/` — NVIDIA NIM model specs

Declarative specs and Docker Compose snippets for the two model services used by
the upstream NVIDIA AI Blueprint for Video Search and Summarization.

| Model | Role | Image / Endpoint | Compose / Provider | Doc |
| --- | --- | --- | --- | --- |
| Hugging Face APIs | LLM + VLM + Embeddings | `https://router.huggingface.co/hf-inference/v1` | Cloud / Serverless / Endpoints | [`huggingface/README.md`](huggingface/README.md) |
| Cosmos Reason 1.7 | VLM (vision-language) | `nvcr.io/nim/nvidia/cosmos3-reasoner:1.7` | `vlm/cosmos3-reasoner.compose.yml` | [`vlm/README.md`](vlm/README.md) |
| Nemotron 3.5 Lightning 30B A3B | LLM (reasoning) | `nvcr.io/nim/nvidia/nemotron-3.5-lightning-30b-a3b:2.0.9-variant` | `llm/nemotron-3.5-lightning-30b-a3b.compose.yml` | [`llm/README.md`](llm/README.md) |

## What is here

- Compose snippets that bring up each NIM as its own container, talking to the
  rest of the stack over the `vss-net` bridge network.
- An `.env.models` file with all NIM-specific env vars (image refs, served
  model names, ports, GPU IDs).
- `pull.sh` and `pull.cmd` — the only commands that touch the public internet
  for this. They do the `docker pull` from `nvcr.io`. Run them on a machine
  with the NGC API key set; the resulting images are stored in the local
  Docker cache.
- `pull` does NOT happen automatically. Nothing in this folder is pulled at
  `docker compose up` time. The `.gitignore` excludes any `.tar` archives
  produced by `docker save` so weight blobs are never committed.

## When to pull

```bash
# On a GPU host with internet + ~80 GB free disk + NGC key
export NGC_CLI_API_KEY=nvapi-...
bash models/pull.sh        # or: models\pull.cmd on Windows
```

After the pull, the compose files in this folder can bring the NIMs up
individually:

```bash
docker compose -f models/llm/nemotron-3.5-lightning-30b-a3b.compose.yml up -d
docker compose -f models/vlm/cosmos3-reasoner.compose.yml                  up -d
```

Or wire them into the top-level `docker-compose.yml` (see
`docs/wire-nims.md` — TODO).

## Sizing the NIM cache

The first start of each NIM downloads weights from NGC into a named volume:

- `cosmos3_reasoner_cache` — ~20 GB
- `nemotron_3_5_lightning_cache` — ~60 GB

Both volumes are managed by Docker, so deletion is `docker volume rm`.

## Offline / pre-baked strategy

For fully air-gapped deployment, after `models/pull.sh` succeeds, save the
images to tarballs on portable storage:

```bash
docker save nvcr.io/nim/nvidia/cosmos3-reasoner:1.7 > cosmos3-reasoner.tar
docker save nvcr.io/nim/nvidia/nemotron-3.5-lightning-30b-a3b:2.0.9-variant > nemotron-3.5-lightning-30b-a3b.tar
```

Transfer the two `.tar` files to the air-gapped host and `docker load` them
back. The image registry URL stays the same; no other changes needed.

## Switching the app to use the NIMs

`docker-compose.yml` already declares the Ollama (local) fallback for LLM and
VLM. To switch to the NIMs, edit the env in `ui/apps/vss-ui/.env.local`:

```ini
LLM_BASE_URL=http://vss-llm-nim:8000/v1
LLM_NAME=nvidia/nemotron-3.5-lightning-30b-a3b
VLM_BASE_URL=http://vss-vlm-nim:8000/v1
VLM_NAME=cosmos3-reasoner
OPENAI_API_KEY=$NGC_CLI_API_KEY      # any non-empty string works for OpenAI-compat NIMs
```

The VSS agent at `vss-agent:8000` already speaks OpenAI-compat, so no code
changes are needed.
