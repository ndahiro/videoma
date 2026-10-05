#!/usr/bin/env bash
# Pre-downloads the two HF model weights used by the vLLM services.
# Run once on a machine with internet + ~25 GB free disk.
# The actual serving happens via `docker compose -f models/vllm/* up` later.
#
# Result: weights sit in a named Docker volume (`vllm_*_cache`) that survives
# container restarts and is reused by the serving containers.
#
# Usage:
#   export HF_TOKEN=hf_...   # optional, only for gated mirrors
#   bash models/vllm/pull.sh
set -euo pipefail

LLM_MODEL="${LLM_MODEL:-nvidia/NVIDIA-Nemotron-Nano-9B-v2-FP8}"
VLM_MODEL="${VLM_MODEL:-nvidia/Cosmos-Reason1-7B}"

echo ">> Pre-creating Docker volumes"
docker volume create vllm_llm_cache >/dev/null
docker volume create vllm_vlm_cache >/dev/null

pull_one() {
  local model="$1"
  local vol="$2"
  echo ">> huggingface-cli download $model into volume $vol"
  docker run --rm \
    -v "${vol}:/cache" \
    -e HF_TOKEN="${HF_TOKEN:-}" \
    huggingface/cli:latest \
    hf download "$model" --local-dir "/cache/$(basename "$model")"
}

pull_one "$LLM_MODEL" vllm_llm_cache
pull_one "$VLM_MODEL" vllm_vlm_cache

echo ">> Done. Sizes:"
docker system df -v --format '{{range .Volumes}}{{.Name}}: {{.Size}}{{"\n"}}{{end}}' | grep vllm || true
