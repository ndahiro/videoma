# Hugging Face Model Serving for Videoma (VSS)

This directory documents how to configure and use **Hugging Face APIs** (Serverless Inference API or Dedicated Inference Endpoints) for all model needs in Videoma / VSS Agent:
1. **LLM** (Large Language Model for orchestration, reasoning, reports, and search planning)
2. **VLM** (Vision Language Model for video understanding and captioning)
3. **Embeddings** (Text and multimodal embeddings for vector search)

---

## 1. Quick Setup via `.env`

Set the following environment variables in `.env` in the project root:

```ini
# --- Hugging Face API Configuration ---
HF_TOKEN=hf_your_huggingface_access_token_here
HF_BASE_URL=https://router.huggingface.co/hf-inference/v1

# Models
HF_LLM_NAME=meta-llama/Llama-3.3-70B-Instruct
HF_VLM_NAME=Qwen/Qwen2.5-VL-7B-Instruct
HF_EMBED_NAME=sentence-transformers/all-MiniLM-L6-v2

# Active Model Stack
LLM_MODEL_TYPE=hf
VLM_MODEL_TYPE=hf
EMBED_PROVIDER=huggingface
```

---

## 2. Supported Hugging Face Models

### A. Large Language Models (LLM)
- `meta-llama/Llama-3.3-70B-Instruct` (Recommended for general reasoning and planning)
- `Qwen/Qwen2.5-72B-Instruct`
- `mistralai/Mistral-Small-24B-Instruct-2501`
- `deepseek-ai/DeepSeek-R1`

### B. Vision-Language Models (VLM)
- `Qwen/Qwen2.5-VL-7B-Instruct` (Recommended for detailed video frame analysis and visual questions)
- `meta-llama/Llama-3.2-11B-Vision-Instruct`
- `OpenGVLab/InternVL2_5-8B`

### C. Embedding Models
- `sentence-transformers/all-MiniLM-L6-v2` (Fast and lightweight)
- `BAAI/bge-m3` (High accuracy multilingual)
- `google/siglip-base-patch16-224` (Multimodal image/text)

---

## 3. Architecture & Agent Integration

- **Agent Framework**: Uses NeMo Agent Toolkit (`nat`) with `_type: openai` pointed to Hugging Face's OpenAI-compatible router (`https://router.huggingface.co/hf-inference/v1`) using `Authorization: Bearer $HF_TOKEN`.
- **Frame Extraction for VLMs**: The `video_understanding` and `video_caption` tools automatically sample frames from video clips and format them as standard `image_url` data URIs (`data:image/jpeg;base64,...`) acceptable by any Hugging Face vision model.
- **Embedding Client**: `vss_agents.embed.HuggingFaceEmbedClient` sends requests to Hugging Face router embeddings or feature extraction endpoints, with an automatic fallback to local `sentence-transformers`.
