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
"""Unit tests for huggingface_embed module."""

from unittest.mock import AsyncMock
from unittest.mock import MagicMock
from unittest.mock import patch

import pytest

from vss_agents.embed.huggingface_embed import HuggingFaceEmbedClient


class TestHuggingFaceEmbedClient:
    """Test HuggingFaceEmbedClient initialization and defaults."""

    def test_init_defaults(self) -> None:
        client = HuggingFaceEmbedClient()
        assert client.model_name == "sentence-transformers/all-MiniLM-L6-v2"
        assert client.endpoint == "https://router.huggingface.co/hf-inference/v1"

    def test_init_custom_params(self) -> None:
        client = HuggingFaceEmbedClient(
            model_name="BAAI/bge-m3",
            endpoint="https://my-custom-endpoint.endpoints.huggingface.cloud/v1",
            api_key="hf_test_token",
        )
        assert client.model_name == "BAAI/bge-m3"
        assert client.endpoint == "https://my-custom-endpoint.endpoints.huggingface.cloud/v1"
        assert client.api_key == "hf_test_token"


class TestHuggingFaceGetTextEmbedding:
    """Test get_text_embedding method."""

    @pytest.fixture
    def client(self) -> HuggingFaceEmbedClient:
        return HuggingFaceEmbedClient(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            api_key="hf_fake_token",
        )

    @pytest.mark.asyncio
    async def test_get_text_embedding_remote_success(self, client: HuggingFaceEmbedClient) -> None:
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "data": [{"embedding": [0.1, 0.2, 0.3, 0.4]}],
            }
            mock_client.post.return_value = mock_response

            embedding = await client.get_text_embedding("person walking in hallway")
            assert embedding == [0.1, 0.2, 0.3, 0.4]

    @pytest.mark.asyncio
    async def test_get_text_embedding_fallback_to_local(self, client: HuggingFaceEmbedClient) -> None:
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client
            mock_client.post.side_effect = Exception("Network connection failed")

            mock_local = MagicMock()
            mock_arr = MagicMock()
            mock_arr.tolist.return_value = [0.5, 0.6, 0.7]
            mock_local.encode.return_value = mock_arr

            client._local_model = mock_local
            embedding = await client.get_text_embedding("traffic congestion")
            assert embedding == [0.5, 0.6, 0.7]
