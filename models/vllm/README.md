# vLLM-served models — GPU server path

These are the model weights you load with vLLM on the GPU server. They are the
HF cousins of the upstream NIM-served models — same family, smaller footprint,
no NGC key needed (publicly hosted on `huggingface.co/nvidia/`).

| Role | HF model id | Approx weight size | Min VRAM |
| --- | --- | --- | --- |
| VLM (vision-language) | `nvidia/Cosmos-Reason1-7B` | ~14 GB (BF16) | 24 GB |
| LLM (reasoning) | `nvidia/NVIDIA-Nemotron-Nano-9B-v2-FP8` | ~9 GB (FP8) | 16 GB |

The agent already understands both via its `openai_*` profiles. No agent code
change — only `.env`:

```ini
LLM_MODEL_TYPE=openai
LLM_NAME=nvidia/NVIDIA-Nemotron-Nano-9B-v2-FP8
LLM_BASE_URL=http://vss-llm-vllm:8000/v1
VLM_MODEL_TYPE=openai
VLM_NAME=nvidia/Cosmos-Reason1-7B
VLM_BASE_URL=http://vss-vlm-vllm:8000/v1
```

## Files

```
models/vllm/
├── README.md
├── llm.compose.yml        ← vLLM serving Nemotron-Nano-9B-v2-FP8
├── vlm.compose.yml        ← vLLM serving Cosmos-Reason1-7B
├── pull.sh / pull.cmd     ← download HF weights into a named volume
```

## Why vLLM, not NIMs

- **Smaller VRAM**: Nano-9B-FP8 + Cosmos-Reason1-7B fit on one 24 GB GPU
  (e.g. RTX 4090, A5000, L4). The full 30B / 22B NIMs need 48 GB+.
- **No NGC key**: weights are public on HuggingFace, no nvcr.io login.
- **Same OpenAI surface**: vLLM exposes `/v1/chat/completions` and
  `/v1/models`. The agent's `openai_llm` / `openai_vlm` profiles talk to it
  with no changes.
- **Tool-calling built in**: Nemotron-Nano-V2 supports tool calling with the
  `nemotron_json` parser (the same one the upstream NIM compose uses).

## Trade-off vs the NIM path in `models/vlm` and `models/llm`

- NIMs = faster inference, NVIDIA-optimized kernels, but heavier (≥48 GB VRAM)
- vLLM = smaller models, single GPU, public weights, easy to swap
- The two are interchangeable: flip `LLM_MODEL_TYPE` between `nim` and `openai`
  and re-point the BASE_URL. The agent's `config.yml` already declares both
  profiles (`nim_llm` + `openai_llm`).

## When to use which

- **Dev / single 24 GB GPU → vLLM** (this folder)
- **Prod / H100 or A100 80 GB → NIMs** (`models/vlm` + `models/llm`)
