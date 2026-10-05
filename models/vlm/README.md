# Cosmos Reason — VLM

**Source:** NVIDIA NIM (NVIDIA AI Blueprint: VSS)
**Image:** `nvcr.io/nim/nvidia/cosmos3-reasoner:1.7`
**Served model:** `cosmos3-reasoner` (OpenAI-compatible `/v1/chat/completions`)
**Role in this app:** vision-language model for the Q&A agent and search results (frame understanding, dense captioning)
**Mirror of upstream:** `deploy/docker/services/nim/cosmos3-reasoner/compose.yml`
**Pull:** see `models/pull.sh`

## What it is

Cosmos Reason is NVIDIA's reasoning VLM — the video understanding brain. It takes a frame or short clip and answers questions about it, or generates dense captions for retrieval. In VSS it is wrapped as a NIM (NVIDIA Inference Microservice) — a single container image that:

- exposes an OpenAI-compatible API on port 8000 (mapped to `${VLM_PORT:-30082}` on the host)
- downloads its model weights from NGC on first start
- supports `nano` and `super` model sizes via `NIM_MODEL_SIZE`

## How the app uses it

`docker-compose.yml` will spin this up as `vss-vlm-nim`. The Python agent (`vss-agent`) talks to it at `http://vss-vlm-nim:8000/v1` using the OpenAI client with `VLM_NAME=cosmos3-reasoner` and `VLM_BASE_URL` pointed at it. The `.env` already carries the equivalent Ollama fallback (`gemma3:latest`) for when GPU resources are unavailable.

## Hardware

- GPU with ≥24 GB VRAM for the nano variant
- ~32 GB shm (`shm_size: 32gb`)
- NVIDIA Container Toolkit, `runtime: nvidia`
- NGC key (`NGC_CLI_API_KEY`) for first-boot weight download

## Config knobs

| Env | Default | Notes |
| --- | --- | --- |
| `NIM_MODEL_SIZE` | `nano` | `nano` or `super` |
| `VLM_NIM_KVCACHE_PERCENT` | `0.7` | KV-cache memory fraction |
| `VLM_DEVICE_ID` | `0` | GPU index |
| `VLM_PORT` | `30082` | Host port |
