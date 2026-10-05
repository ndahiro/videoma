# SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import base64
import io
import logging
import os
import tempfile
from typing import Any
from typing import override

import httpx
from PIL import Image

from vss_agents.embed.embed import EmbedClient

logger = logging.getLogger(__name__)


class HuggingFaceEmbedClient(EmbedClient):
    """
    Embedding client supporting Hugging Face Inference API, Hugging Face Dedicated
    Endpoints, and local sentence-transformers models.
    """

    def __init__(
        self,
        model_name: str | None = None,
        endpoint: str | None = None,
        api_key: str | None = None,
    ) -> None:
        """
        Initialize Hugging Face embedding client.

        Args:
            model_name: Hugging Face model repository or identifier.
                Defaults to HF_EMBED_NAME env var or 'sentence-transformers/all-MiniLM-L6-v2'.
            endpoint: Custom base URL (e.g. https://router.huggingface.co/hf-inference/v1).
            api_key: Hugging Face API token (HF_TOKEN or HUGGINGFACE_API_KEY).
        """
        self.model_name = (
            model_name
            or os.getenv("HF_EMBED_NAME")
            or os.getenv("HF_EMBED_MODEL")
            or "sentence-transformers/all-MiniLM-L6-v2"
        )
        self.api_key = (
            api_key
            or os.getenv("HF_TOKEN")
            or os.getenv("HUGGINGFACE_API_KEY")
            or os.getenv("OPENAI_API_KEY")
        )
        raw_endpoint = endpoint or os.getenv("HF_EMBED_BASE_URL") or os.getenv("HF_BASE_URL")
        if raw_endpoint:
            self.endpoint = raw_endpoint.rstrip("/")
        else:
            self.endpoint = "https://router.huggingface.co/hf-inference/v1"

        self._local_model: Any = None
        logger.info(
            "Initialized HuggingFaceEmbedClient with model=%s, endpoint=%s",
            self.model_name,
            self.endpoint,
        )

    def _get_local_model(self) -> Any:
        """Lazy loader for local sentence-transformers fallback."""
        if self._local_model is None:
            try:
                from sentence_transformers import SentenceTransformer  # type: ignore

                logger.info("Loading local sentence-transformers model: %s", self.model_name)
                self._local_model = SentenceTransformer(self.model_name)
            except Exception as e:
                logger.error("Failed to load local SentenceTransformer (%s): %s", self.model_name, e)
                raise
        return self._local_model

    @override
    async def get_text_embedding(self, text: str) -> list[float]:
        """
        Generate embedding for text input using Hugging Face Inference API or local fallback.
        """
        headers: dict[str, str] = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        # 1. Try OpenAI-compatible /embeddings endpoint (supported by HF router)
        openai_embed_url = (
            self.endpoint
            if self.endpoint.endswith("/embeddings")
            else f"{self.endpoint}/embeddings"
            if self.endpoint.endswith("/v1")
            else f"{self.endpoint}/v1/embeddings"
        )

        payload = {
            "model": self.model_name,
            "input": text,
        }

        timeout = httpx.Timeout(connect=20.0, read=60.0, write=60.0, pool=20.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(openai_embed_url, json=payload, headers=headers)
                if response.status_code == 200:
                    res_json = response.json()
                    if "data" in res_json and len(res_json["data"]) > 0:
                        embedding: list[float] = res_json["data"][0]["embedding"]
                        return embedding

                # 2. Try direct HF pipeline feature-extraction endpoint
                pipeline_url = f"https://router.huggingface.co/hf-inference/models/{self.model_name}"
                pipeline_res = await client.post(pipeline_url, json={"inputs": text}, headers=headers)
                if pipeline_res.status_code == 200:
                    p_json = pipeline_res.json()
                    if isinstance(p_json, list):
                        if len(p_json) > 0 and isinstance(p_json[0], (int, float)):
                            return [float(x) for x in p_json]
                        if len(p_json) > 0 and isinstance(p_json[0], list):
                            # Token embeddings: mean pool
                            import numpy as np

                            arr = np.mean(p_json, axis=0)
                            return [float(x) for x in arr.tolist()]

        except Exception as e:
            logger.warning(
                "Remote HF embedding API call to %s failed (%s). Falling back to local SentenceTransformer.",
                openai_embed_url,
                e,
            )

        # 3. Local sentence-transformers fallback
        local_model = self._get_local_model()
        vec = local_model.encode(text)
        return [float(x) for x in vec.tolist()]

    @override
    async def get_image_embedding(self, image_url: str) -> list[float]:
        """
        Generate embedding for image input (base64 data URI, HTTP URL, or local path).
        """
        image_bytes: bytes | None = None
        if image_url.startswith("data:image/"):
            try:
                base64_data = image_url.split(",", 1)[1]
                image_bytes = base64.b64decode(base64_data)
            except Exception as e:
                logger.error("Failed to decode base64 image: %s", e)
                raise
        elif image_url.startswith(("http://", "https://")):
            timeout = httpx.Timeout(connect=20.0, read=60.0, write=60.0, pool=20.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(image_url)
                resp.raise_for_status()
                image_bytes = resp.content
        elif os.path.exists(image_url):
            with open(image_url, "rb") as f:
                image_bytes = f.read()

        if image_bytes is None:
            raise ValueError(f"Could not retrieve image data from: {image_url[:100]}")

        # Local PIL image processing
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        local_model = self._get_local_model()
        if hasattr(local_model, "encode"):
            vec = local_model.encode(img)
            return [float(x) for x in vec.tolist()]

        # Fallback to zero vector if unsupported
        return [0.0] * 384

    @override
    async def get_video_embedding(self, video_url: str) -> list[float]:
        """
        Generate embedding for video input by sampling key frames and pooling their embeddings.
        """
        logger.info("Generating video embedding for: %s", video_url[:100])
        # Download video to temp file if remote URL
        temp_file = None
        video_path = video_url
        if video_url.startswith(("http://", "https://")):
            timeout = httpx.Timeout(connect=30.0, read=120.0, write=120.0, pool=30.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(video_url)
                resp.raise_for_status()
                temp_file = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                temp_file.write(resp.content)
                temp_file.close()
                video_path = temp_file.name

        try:
            import cv2  # type: ignore
            import numpy as np

            cap = cv2.VideoCapture(video_path)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            duration = frame_count / fps if fps > 0 else 0

            # Sample up to 8 evenly distributed frames
            num_samples = min(max(int(duration), 4), 8)
            step = max(frame_count // num_samples, 1)

            frame_embeddings: list[list[float]] = []
            local_model = self._get_local_model()

            for i in range(0, frame_count, step):
                cap.set(cv2.CAP_PROP_POS_FRAMES, i)
                ret, frame = cap.read()
                if not ret or frame is None:
                    continue
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_img = Image.fromarray(rgb_frame)
                if hasattr(local_model, "encode"):
                    vec = local_model.encode(pil_img)
                    frame_embeddings.append([float(x) for x in vec.tolist()])
                if len(frame_embeddings) >= num_samples:
                    break

            cap.release()

            if frame_embeddings:
                mean_vec = np.mean(frame_embeddings, axis=0)
                # L2 normalize
                norm = np.linalg.norm(mean_vec)
                if norm > 0:
                    mean_vec = mean_vec / norm
                return [float(x) for x in mean_vec.tolist()]

            # Fallback text representation if frame extraction yields empty
            return await self.get_text_embedding("video content")

        finally:
            if temp_file is not None and os.path.exists(temp_file.name):
                try:
                    os.unlink(temp_file.name)
                except Exception:
                    pass
