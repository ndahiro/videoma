# Nemotron 3.5 Lightning 30B A3B — LLM

**Source:** NVIDIA NIM (NVIDIA AI Blueprint: VSS)
**Image:** `nvcr.io/nim/nvidia/nemotron-3.5-lightning-30b-a3b:2.0.9-variant`
**Served model:** `nvidia/nemotron-3.5-lightning-30b-a3b` (OpenAI-compatible `/v1/chat/completions`)
**Role in this app:** text reasoning LLM for the Q&A agent, summarization, and the agent's tool-calling loop
**Mirror of upstream:** `deploy/docker/services/nim/nemotron-3.5-lightning-30b-a3b/compose.yml`
**Pull:** see `models/pull.sh`

## What it is

Nemotron 3.5 Lightning 30B A3B is a hybrid Mamba-Transformer MoE reasoning model. The "A3B" suffix means 3B active parameters out of 30B total — it is fast. The NIM image:

- exposes an OpenAI-compatible API on port 8000 (mapped to `${LLM_PORT:-30081}` on the host)
- downloads weights from NGC on first start
- supports tool calling out of the box

## How the app uses it

`docker-compose.yml` will spin this up as `vss-llm-nim`. The Python agent talks to it at `http://vss-llm-nim:8000/v1` using the OpenAI client with `LLM_NAME=nvidia/nemotron-3.5-lightning-30b-a3b`. The `.env` already carries the equivalent Ollama fallback (`qwen3.5:9B`).

## Hardware

- GPU with ≥48 GB VRAM (the A3B variant is bigger than nano)
- ~16 GB shm
- NVIDIA Container Toolkit, `runtime: nvidia`
- NGC key (`NGC_CLI_API_KEY`) for first-boot weight download

## Config knobs

| Env | Default | Notes |
| --- | --- | --- |
| `NIM_MAX_MODEL_LEN` | unset | optional vLLM override |
| `NIM_MAX_NUM_SEQS` | unset | optional vLLM override |
| `NIM_GPU_MEM_FRACTION` | `0.85` | GPU memory utilization |
| `LLM_DEVICE_ID` | `0` | GPU index |
| `LLM_PORT` | `30081` | Host port |
