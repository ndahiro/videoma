#!/usr/bin/env bash
# Pulls the two NVIDIA NIM model images used by the upstream VSS blueprint.
# Run once on a machine with internet + nvcr.io creds + enough disk.
# Resulting images are not committed to git (see ../.gitignore).
#
# Usage:
#   export NGC_CLI_API_KEY=nvapi-...   # from https://org.ngc.nvidia.com/setup/api-keys
#   bash models/pull.sh
#
# Verify after pull:
#   docker images | grep -E "cosmos3-reasoner|nemotron-3.5"

set -euo pipefail

if [[ -z "${NGC_CLI_API_KEY:-}" ]]; then
  echo "ERROR: NGC_CLI_API_KEY is not set." >&2
  echo "       export NGC_CLI_API_KEY=nvapi-..." >&2
  exit 1
fi

VLM_IMAGE="${VLM_NIM_IMAGE:-nvcr.io/nim/nvidia/cosmos3-reasoner:1.7}"
LLM_IMAGE="${LLM_NIM_IMAGE:-nvcr.io/nim/nvidia/nemotron-3.5-lightning-30b-a3b:2.0.9-variant}"

echo ">> docker login nvcr.io"
echo "$NGC_CLI_API_KEY" | docker login nvcr.io -u '$oauthtoken' --password-stdin

echo ">> docker pull $VLM_IMAGE"
docker pull "$VLM_IMAGE"

echo ">> docker pull $LLM_IMAGE"
docker pull "$LLM_IMAGE"

echo ">> done. images present:"
docker images --format "  {{.Repository}}:{{.Tag}}\t{{.Size}}" \
  | grep -E "cosmos3-reasoner|nemotron-3.5" || true
