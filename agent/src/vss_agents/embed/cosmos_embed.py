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
import logging
import os
from typing import Any, override

import httpx

from vss_agents.embed.embed import EmbedClient

logger = logging.getLogger(__name__)


class CosmosEmbedClient(EmbedClient):
    """Client for NVIDIA Cosmos Embeddings (cloud-hosted NIM or self-hosted)."""

    def __init__(self, endpoint: str, api_key: str | None = None, model: str | None = None):
        self.endpoint = endpoint
        self.text_embeddings_url = f"{endpoint}/v1/generate_text_embeddings"
        self.image_embeddings_url = f"{endpoint}/v1/generate_image_embeddings"
        self.video_embeddings_url = f"{endpoint}/v1/generate_video_embeddings"

        endpoint_clean = endpoint.rstrip("/") if endpoint else "https://integrate.api.nvidia.com/v1"
        self.api_key = api_key or os.getenv("NVIDIA_API_KEY") or os.getenv("OPENAI_API_KEY") or ""
        self.model = model or os.getenv("COSMOS_EMBED_MODEL") or "nvidia/cosmos-embed1"

        if endpoint_clean.endswith("/v1"):
            base = endpoint_clean
        else:
            base = f"{endpoint_clean}/v1"

        self.nim_embeddings_url = f"{base}/embeddings"
        self.is_nim_api = "integrate.api.nvidia.com" in endpoint_clean or endpoint.endswith("/v1")

    def _get_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    @override
    async def get_image_embedding(self, image_url: str) -> list[float]:
        """Generate embedding for image input"""
        if image_url.startswith("data:image/"):
            formatted_input = image_url
        else:
            formatted_input = f"data:image/jpeg;presigned_url,{image_url}"

        headers = self._get_headers()
        timeout = httpx.Timeout(connect=30.0, read=120.0, write=120.0, pool=30.0)

        # Try NIM API catalog endpoint first if hosted, otherwise self-hosted endpoint
        target_url = self.nim_embeddings_url if self.is_nim_api else self.image_embeddings_url
        payload: dict[str, Any] = {
            "input": [formatted_input],
            "request_type": "query",
            "encoding_format": "float",
            "model": self.model,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(target_url, json=payload, headers=headers)
                if response.status_code == 404 and target_url != self.nim_embeddings_url:
                    # Fallback to standard /v1/embeddings
                    response = await client.post(self.nim_embeddings_url, json=payload, headers=headers)
                response.raise_for_status()
                result = response.json()

            item = result["data"][0]
            embedding: list[float] = item.get("embedding") or item.get("embeddings") or []
            return embedding
        except httpx.HTTPError as e:
            logger.error(f"Failed to get image embedding: {e}")
            raise

    @override
    async def get_text_embedding(self, text: str) -> list[float]:
        """Generate embedding for text input"""
        headers = self._get_headers()
        timeout = httpx.Timeout(connect=30.0, read=120.0, write=120.0, pool=30.0)

        if self.is_nim_api:
            payload: dict[str, Any] = {
                "input": [text],
                "model": self.model,
                "encoding_format": "float",
            }
            target_url = self.nim_embeddings_url
        else:
            payload = {
                "text_input": [text],
                "model": self.model if "/" not in self.model else "cosmos-embed1-448p",
            }
            target_url = self.text_embeddings_url

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(target_url, json=payload, headers=headers)
                if response.status_code == 404 and target_url != self.nim_embeddings_url:
                    # Fallback to standard /v1/embeddings
                    nim_payload = {
                        "input": [text],
                        "model": self.model,
                        "encoding_format": "float",
                    }
                    response = await client.post(self.nim_embeddings_url, json=nim_payload, headers=headers)
                response.raise_for_status()
                result = response.json()

            item = result["data"][0]
            embeddings: list[float] = item.get("embedding") or item.get("embeddings") or []
            return embeddings
        except httpx.HTTPError as e:
            logger.error(f"Failed to get text embedding: {e}")
            raise

    @override
    async def get_video_embedding(self, video_url: str) -> list[float]:
        """Generate embedding for video input"""
        return (await self.get_video_embeddings_from_urls([video_url]))[0]

    async def get_video_embeddings_from_urls(self, urls: list[str]) -> list[list[float]]:
        """Generate embeddings for videos from URLs (public or presigned)"""
        logger.info(f"Generating embeddings for {len(urls)} video chunks via URLs")

        formatted_urls = [f"data:video/mp4;presigned_url,{url}" for url in urls]
        payload = {
            "input": formatted_urls,
            "model": self.model,
            "encoding_format": "float",
            "request_type": "bulk_video",
        }

        headers = self._get_headers()
        timeout = httpx.Timeout(connect=30.0, read=120.0, write=120.0, pool=30.0)

        target_url = self.nim_embeddings_url if self.is_nim_api else self.video_embeddings_url

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(target_url, json=payload, headers=headers)
            if response.status_code == 404 and target_url != self.nim_embeddings_url:
                response = await client.post(self.nim_embeddings_url, json=payload, headers=headers)
            response.raise_for_status()
            result = response.json()

        embeddings = [item.get("embedding") or item.get("embeddings") for item in result["data"]]
        logger.info(f"Successfully generated {len(embeddings)} embeddings")
        return embeddings

