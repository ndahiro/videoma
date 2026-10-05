/**
 * HuggingFace Inference API client (via Inference Providers router).
 *
 * Replaces the NVIDIA-specific services (cosmos-embed1 for embeddings,
 * Cosmos-Reason1 / Nemotron for VLM) with HF-hosted models that work through
 * the Inference Providers router — no GPU stack, no NGC, no VST required.
 *
 * NOTE (Oct 2026): the legacy `https://api-inference.huggingface.co` endpoint
 * is dead, and CLIP/BLIP/LLaVA-Video are not served by the `hf-inference`
 * serverless provider anymore. So:
 *   - text embeddings go to a supported feature-extraction model
 *     (default BAAI/bge-small-en-v1.5) on the router;
 *   - image "embeddings" are caption-then-embed (caption via VLM chat
 *     completion, then the same text-embedding model), keeping queries and
 *     frames in one comparable space;
 *   - captions + video Q&A go to an OpenAI-compatible VLM chat model
 *     (default Qwen/Qwen3-VL-30B-A3B-Instruct) on the router.
 *
 * Env vars:
 *   HF_API_KEY           — HuggingFace API token (needs inference permission)
 *   HF_EMBEDDING_MODEL   — feature-extraction model (default: BAAI/bge-small-en-v1.5)
 *   HF_VLM_MODEL         — chat-completion VLM (default: Qwen/Qwen3-VL-30B-A3B-Instruct,
 *                          HF_VLM_NAME also honoured)
 *   HF_BASE_URL          — override for the feature-extraction base
 *                          (default: https://router.huggingface.co/hf-inference)
 *   HF_CHAT_BASE_URL     — override for the chat-completions base
 *                          (default: https://router.huggingface.co/v1)
 *   OLLAMA_BASE_URL        — e.g. http://localhost:11435 (local dev, pointing
 *                          at the dockerized Ollama) or http://ollama:11434
 *                          (inside docker compose). Enables the local path
 *                          when combined with OLLAMA_VLM_MODEL and/or
 *                          OLLAMA_EMBED_MODEL.
 *   OLLAMA_VLM_MODEL       — e.g. hf.co/apolo13x/Cosmos-Reason2-2B-GGUF:Q4_K_M
 *                          (captions + video Q&A via Ollama's OpenAI-compatible
 *                          /v1/chat/completions, vision supported)
 *   OLLAMA_EMBED_MODEL     — e.g. bge-m3 (text embeddings via Ollama's
 *                          native /api/embeddings)
 *
 * Provider precedence: NVIDIA (when NVIDIA_API_KEY is set) → Ollama (when
 * configured) → HF Inference Providers router.
 */
import { Readable } from "stream";

const HF_API_KEY = process.env.HF_API_KEY?.trim() || "";
// Accept a legacy override like ".../hf-inference/v1" and normalise it.
const HF_INFERENCE_BASE = (
  process.env.HF_BASE_URL || "https://router.huggingface.co/hf-inference"
)
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/v1$/, "");
const HF_CHAT_BASE = (
  process.env.HF_CHAT_BASE_URL || "https://router.huggingface.co/v1"
)
  .trim()
  .replace(/\/+$/, "");

const EMBEDDING_MODEL =
  process.env.HF_EMBEDDING_MODEL || "BAAI/bge-small-en-v1.5";
const VLM_MODEL =
  process.env.HF_VLM_MODEL ||
  process.env.HF_VLM_NAME ||
  "Qwen/Qwen3-VL-30B-A3B-Instruct";

// Local Ollama (dockerized for dev/testing). No defaults — the HF router
// stays the default until these are explicitly set.
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "").trim().replace(/\/+$/, "");
const OLLAMA_VLM_MODEL = (process.env.OLLAMA_VLM_MODEL || "").trim();
const OLLAMA_EMBED_MODEL = (process.env.OLLAMA_EMBED_MODEL || "").trim();
// Per-request context window for Ollama chat calls. Small vision models boot
// with n_ctx=4096, which fits ~3 full frames; raise for larger prompts.
function ollamaNumCtx(): number {
  const raw = Number(process.env.OLLAMA_NUM_CTX);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 8192;
}

// Max frames attached to one VLM chat call (summarize + Q&A). Five full-res
// frames overflow small-model context windows (Cosmos-Reason2-2B ≈ 4096
// tokens); three keeps prompts safely inside while still covering the reel.
function vqaMaxFrames(): number {
  const raw = Number(process.env.HF_VQA_FRAMES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3;
}

/** Origin without any trailing /v1, for Ollama's native endpoints. */
function ollamaOrigin(): string {
  return OLLAMA_BASE_URL.replace(/\/v1$/, "");
}

/** Full OpenAI-compatible chat-completions URL for the Ollama server. */
function ollamaChatUrl(): string {
  return OLLAMA_BASE_URL.endsWith("/v1")
    ? `${OLLAMA_BASE_URL}/chat/completions`
    : `${OLLAMA_BASE_URL}/v1/chat/completions`;
}

function isOllamaChatEnabled(): boolean {
  return Boolean(OLLAMA_BASE_URL && OLLAMA_VLM_MODEL);
}

function isOllamaEmbedEnabled(): boolean {
  return Boolean(OLLAMA_BASE_URL && OLLAMA_EMBED_MODEL);
}

// NVIDIA NIM API Catalog / Cosmos config
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY?.trim() || "";
const NVIDIA_BASE_URL = (
  process.env.NVIDIA_BASE_URL ||
  process.env.LLM_BASE_URL ||
  "https://integrate.api.nvidia.com/v1"
).replace(/\/+$/, "");
const COSMOS_EMBED_MODEL = process.env.COSMOS_EMBED_MODEL || "nvidia/cosmos-embed1";
const COSMOS_VLM_MODEL = process.env.VLM_NAME || "nvidia/cosmos-reason2-8b";

export function isNvidiaEnabled(): boolean {
  return Boolean(NVIDIA_API_KEY);
}

export interface HfEmbeddingResult {
  embedding: number[];
}

interface ChatContentItem {
  type: string;
  text?: string;
  image_url?: { url: string };
}

export interface HfChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ChatContentItem[];
}

export interface HfChatResult {
  content: string;
}

function getHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (HF_API_KEY) {
    headers.Authorization = `Bearer ${HF_API_KEY}`;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Concurrency cap + retry for the shared HF Inference API.
//
// Without a cap, N concurrent uploads × M frames each fan out into unbounded
// parallel calls: HF answers with 429s and the event loop drowns in sockets.
// Tune with:
//   HF_CONCURRENCY    — max in-flight HF calls per app instance (default 8)
//   HF_MAX_RETRIES    — retries on 429/5xx/network errors (default 4)
//   HF_RETRY_BASE_MS  — base backoff delay, doubled per attempt (default 1000)
// ---------------------------------------------------------------------------

function hfConcurrency(): number {
  const raw = Number(process.env.HF_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 8;
}

function hfMaxRetries(): number {
  const raw = Number(process.env.HF_MAX_RETRIES);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 4;
}

function hfRetryBaseMs(): number {
  const raw = Number(process.env.HF_RETRY_BASE_MS);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 1000;
}

let hfInFlight = 0;
const hfWaiters: Array<() => void> = [];

async function acquireHfSlot(): Promise<void> {
  if (hfInFlight < hfConcurrency()) {
    hfInFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => hfWaiters.push(resolve));
  hfInFlight += 1;
}

function releaseHfSlot(): void {
  hfInFlight = Math.max(0, hfInFlight - 1);
  const next = hfWaiters.shift();
  if (next) next();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

/**
 * Generic call to an HF Inference Providers feature-extraction endpoint.
 *
 * Retries 429 / 5xx / network failures with exponential backoff + jitter and
 * honours `Retry-After`, so bursts degrade into slower responses instead of
 * hard failures.
 */
async function hfApi<T>(
  model: string,
  body: unknown,
  timeoutMs = 120_000,
): Promise<T> {
  const maxRetries = hfMaxRetries();
  const baseMs = hfRetryBaseMs();
  let attempt = 0;

  for (;;) {
    await acquireHfSlot();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${HF_INFERENCE_BASE}/models/${model}`, {
          method: "POST",
          headers: {
            ...getHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (res.ok) {
          return (await res.json()) as T;
        }

        const retryable = res.status === 429 || res.status >= 500;
        const text = await res.text().catch(() => "");
        if (!retryable || attempt >= maxRetries) {
          throw new Error(
            `HF API error (${res.status}) for model ${model}: ${text.slice(0, 500)}`,
          );
        }
        const backoff = retryAfterMs(res) ?? baseMs * 2 ** attempt;
        attempt += 1;
        await sleep(backoff + Math.floor(Math.random() * 250));
        continue;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      const isAbort =
        err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
      // Timeouts and network errors are retryable; app-code errors are not.
      const networkish =
        isAbort ||
        (err instanceof TypeError) ||
        (err instanceof Error && /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(err.message));
      if (!networkish || attempt >= maxRetries) throw err;
      attempt += 1;
      await sleep(baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
      continue;
    } finally {
      releaseHfSlot();
    }
  }
}

/**
 * Call an OpenAI-compatible chat-completions endpoint (HF router or local
 * Ollama — used for VLM captions and video Q&A). Shares the same
 * retry/backoff policy as hfApi: 429/5xx/network errors are retried,
 * Retry-After honoured.
 */
async function hfChatCompletion(
  chatUrl: string,
  model: string,
  apiKey: string,
  messages: Array<{ role: string; content: unknown }>,
  options: {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    // Extra top-level body fields for this call only (e.g. Ollama `options`).
    // Never set for the HF router — it rejects unknown fields.
    extraBody?: Record<string, unknown>;
  } = {},
): Promise<string> {
  const { maxTokens = 512, temperature = 0.2, timeoutMs = 180_000, extraBody } = options;
  const maxRetries = hfMaxRetries();
  const baseMs = hfRetryBaseMs();
  let attempt = 0;

  for (;;) {
    await acquireHfSlot();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers: Record<string, string> = {
          Accept: "application/json",
          "Content-Type": "application/json",
        };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        const res = await fetch(chatUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
            ...extraBody,
          }),
          signal: controller.signal,
        });

        if (res.ok) {
          const data = await res.json();
          const text: unknown = data?.choices?.[0]?.message?.content;
          if (typeof text === "string" && text.trim()) return text.trim();
          throw new Error(
            `Unexpected chat response shape: ${JSON.stringify(data).slice(0, 200)}`,
          );
        }

        const retryable = res.status === 429 || res.status >= 500;
        const text = await res.text().catch(() => "");
        if (!retryable || attempt >= maxRetries) {
          throw new Error(
            `Chat error (${res.status}) for model ${model}: ${text.slice(0, 500)}`,
          );
        }
        const backoff = retryAfterMs(res) ?? baseMs * 2 ** attempt;
        attempt += 1;
        await sleep(backoff + Math.floor(Math.random() * 250));
        continue;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      const isAbort =
        err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
      const networkish =
        isAbort ||
        err instanceof TypeError ||
        (err instanceof Error && /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(err.message));
      if (!networkish || attempt >= maxRetries) throw err;
      attempt += 1;
      await sleep(baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
      continue;
    } finally {
      releaseHfSlot();
    }
  }
}

function hfRouterChat(
  messages: Array<{ role: string; content: unknown }>,
  options: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  if (!HF_API_KEY) {
    throw new Error(
      "HF_API_KEY is not set — add your HuggingFace token to ui/apps/vss-ui/.env.local and restart `pnpm dev`.",
    );
  }
  return hfChatCompletion(
    `${HF_CHAT_BASE}/chat/completions`,
    VLM_MODEL,
    HF_API_KEY,
    messages,
    options,
  );
}

/**
 * Text embeddings via the local Ollama server (native /api/embeddings).
 */
async function ollamaTextEmbedding(text: string): Promise<number[]> {
  const maxRetries = hfMaxRetries();
  const baseMs = hfRetryBaseMs();
  let attempt = 0;

  for (;;) {
    await acquireHfSlot();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      try {
        const response = await fetch(`${ollamaOrigin()}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data?.embedding)) return data.embedding as number[];
          throw new Error(
            `Unexpected embeddings shape: ${JSON.stringify(data).slice(0, 200)}`,
          );
        }
        const retryable = response.status === 429 || response.status >= 500;
        const errText = await response.text().catch(() => "");
        if (!retryable || attempt >= maxRetries) {
          throw new Error(
            `Ollama embeddings error (${response.status}) for model ${OLLAMA_EMBED_MODEL}: ${errText.slice(0, 500)}`,
          );
        }
        const backoff = retryAfterMs(response) ?? baseMs * 2 ** attempt;
        attempt += 1;
        await sleep(backoff + Math.floor(Math.random() * 250));
        continue;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      const isAbort =
        err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
      const networkish =
        isAbort ||
        err instanceof TypeError ||
        (err instanceof Error && /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(err.message));
      if (!networkish || attempt >= maxRetries) throw err;
      attempt += 1;
      await sleep(baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
      continue;
    } finally {
      releaseHfSlot();
    }
  }
}

/**
 * Get a text embedding via NVIDIA Cosmos Embed, local Ollama, or HF
 * feature-extraction fallback (in that order).
 */
export async function getTextEmbedding(text: string): Promise<number[]> {
  if (isNvidiaEnabled()) {
    try {
      const endpoint = NVIDIA_BASE_URL.endsWith("/v1")
        ? `${NVIDIA_BASE_URL}/embeddings`
        : `${NVIDIA_BASE_URL}/v1/embeddings`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
          model: COSMOS_EMBED_MODEL,
          input: text,
          encoding_format: "float",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const emb = data?.data?.[0]?.embedding || data?.data?.[0]?.embeddings;
        if (Array.isArray(emb)) {
          return emb;
        }
      }
      console.warn(`NVIDIA text embedding returned status ${res.status}, falling back to HF`);
    } catch (err) {
      console.warn("NVIDIA getTextEmbedding error, falling back to HF:", err);
    }
  }

  if (isOllamaEmbedEnabled()) {
    try {
      return await ollamaTextEmbedding(text);
    } catch (err) {
      console.warn("Ollama getTextEmbedding error, falling back to HF:", err);
    }
  }

  const result = await hfApi<HfEmbeddingResult[]>(
    EMBEDDING_MODEL,
    { inputs: text },
    60_000,
  );
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as unknown as number[];
  }
  return result as unknown as number[];
}

export interface HfVideoQaOptions {
  video: {
    path?: string;
    url?: string;
    frames?: string[];
  };
  question: string;
}

/**
 * Ask a question about video content using NVIDIA Cosmos-Reason or HF VLM.
 */
export async function videoQuestionAnswer(
  options: HfVideoQaOptions,
  onChunk?: (chunk: HfChatResult) => void,
): Promise<string> {
  const { video, question } = options;

  if (isNvidiaEnabled()) {
    try {
      const endpoint = NVIDIA_BASE_URL.endsWith("/v1")
        ? `${NVIDIA_BASE_URL}/chat/completions`
        : `${NVIDIA_BASE_URL}/v1/chat/completions`;

      const content: Array<{ type: string; text?: string; image_url?: { url: string }; video_url?: { url: string } }> = [
        { type: "text", text: question },
      ];

      if (video.frames && video.frames.length > 0) {
        for (const frame of video.frames) {
          content.push({
            type: "image_url",
            image_url: { url: frame.startsWith("data:") ? frame : `data:image/jpeg;base64,${frame}` },
          });
        }
      } else if (video.url) {
        content.push({
          type: "video_url",
          video_url: { url: video.url },
        });
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
          model: COSMOS_VLM_MODEL,
          messages: [{ role: "user", content }],
          max_tokens: 1024,
          temperature: 0.2,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data?.choices?.[0]?.message?.content;
        if (reply) {
          return reply.trim();
        }
      }
      console.warn(`NVIDIA Cosmos VLM returned status ${res.status}, falling back to HF`);
    } catch (err) {
      console.warn("NVIDIA videoQuestionAnswer error, falling back to HF:", err);
    }
  }

  // Cap attached frames: small local vision models (e.g. Cosmos-Reason2-2B
  // at n_ctx=4096) reject 5-frame prompts as context overflow.
  const frames = (video.frames ?? []).slice(0, vqaMaxFrames());

  const content: ChatContentItem[] = [
    { type: "text", text: `${question}\n\nAnswer based on the video frames provided.` },
  ];

  if (frames.length > 0) {
    for (const frame of frames) {
      content.push({
        type: "image_url",
        image_url: { url: frame.startsWith("data:") ? frame : `data:image/jpeg;base64,${frame}` },
      });
    }
  } else if (video.url) {
    content.push({ type: "text", text: `Video URL: ${video.url}` });
  }

  if (isOllamaChatEnabled()) {
    try {
      return await hfChatCompletion(
        ollamaChatUrl(),
        OLLAMA_VLM_MODEL,
        "",
        [{ role: "user", content }],
        {
          maxTokens: 512,
          temperature: 0.2,
          timeoutMs: 300_000,
          extraBody: { options: { num_ctx: ollamaNumCtx() } },
        },
      );
    } catch (err) {
      console.warn("Ollama videoQuestionAnswer error, falling back to HF:", err);
    }
  }

  return hfRouterChat([{ role: "user", content }], {
    maxTokens: 512,
    temperature: 0.2,
    timeoutMs: 300_000,
  });
}

/**
 * Generate a text caption for a video frame / image.
 * Uses NVIDIA Cosmos-Reason or the HF router VLM (chat completions).
 */
export async function captionImage(
  imageData: string,
): Promise<string> {
  if (isNvidiaEnabled()) {
    try {
      const endpoint = NVIDIA_BASE_URL.endsWith("/v1")
        ? `${NVIDIA_BASE_URL}/chat/completions`
        : `${NVIDIA_BASE_URL}/v1/chat/completions`;

      const formatted = imageData.startsWith("data:")
        ? imageData
        : `data:image/jpeg;base64,${imageData}`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
          model: COSMOS_VLM_MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Describe what is happening in this image in 1-2 concise sentences." },
                { type: "image_url", image_url: { url: formatted } },
              ],
            },
          ],
          max_tokens: 128,
          temperature: 0.1,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) {
          return text.trim();
        }
      }
    } catch (err) {
      console.warn("NVIDIA captionImage error, falling back to HF VLM:", err);
    }
  }

  const formatted = imageData.startsWith("data:")
    ? imageData
    : `data:image/jpeg;base64,${imageData}`;

  if (isOllamaChatEnabled()) {
    try {
      return await hfChatCompletion(
        ollamaChatUrl(),
        OLLAMA_VLM_MODEL,
        "",
        [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe what is happening in this image in 1-2 concise sentences." },
              { type: "image_url", image_url: { url: formatted } },
            ],
          },
        ],
        {
          maxTokens: 128,
          temperature: 0.1,
          timeoutMs: 180_000,
          extraBody: { options: { num_ctx: ollamaNumCtx() } },
        },
      );
    } catch (err) {
      console.warn("Ollama captionImage error, falling back to HF VLM:", err);
    }
  }

  return hfRouterChat(
    [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe what is happening in this image in 1-2 concise sentences." },
          { type: "image_url", image_url: { url: formatted } },
        ],
      },
    ],
    { maxTokens: 128, temperature: 0.1, timeoutMs: 180_000 },
  );
}

export {
  HF_API_KEY,
  HF_INFERENCE_BASE as HF_BASE_URL,
  HF_CHAT_BASE,
  EMBEDDING_MODEL,
  VLM_MODEL,
  NVIDIA_API_KEY,
  NVIDIA_BASE_URL,
  COSMOS_EMBED_MODEL,
  COSMOS_VLM_MODEL,
  OLLAMA_BASE_URL,
  OLLAMA_VLM_MODEL,
  OLLAMA_EMBED_MODEL,
};
