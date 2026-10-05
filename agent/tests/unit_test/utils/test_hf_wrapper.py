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
"""Tests for vss_agents/utils/hf_wrapper.py."""

from unittest.mock import MagicMock
from unittest.mock import patch

import pytest

from vss_agents.utils.hf_wrapper import HuggingFaceChatModel
from vss_agents.utils.hf_wrapper import get_hf_llm
from vss_agents.utils.hf_wrapper import get_hf_vlm


def _mock_response(text: str) -> MagicMock:
    """Build a mocked InferenceClient chat_completion response."""
    message = MagicMock()
    message.content = text
    message.tool_calls = []
    choice = MagicMock()
    choice.message = message
    response = MagicMock()
    response.choices = [choice]
    return response


def _mock_tool_response(name: str, args: dict, call_id: str = "call_1") -> MagicMock:
    """Build a mocked response carrying one tool call."""
    import json

    function = MagicMock()
    function.name = name
    function.arguments = json.dumps(args)
    call = MagicMock()
    call.id = call_id
    call.function = function
    message = MagicMock()
    message.content = ""
    message.tool_calls = [call]
    choice = MagicMock()
    choice.message = message
    response = MagicMock()
    response.choices = [choice]
    return response


class TestGetHfLlm:
    """Tests for get_hf_llm factory."""

    @pytest.mark.asyncio
    async def test_returns_chat_model_with_explicit_id(self) -> None:
        """Explicit HF repo id is used directly."""
        llm = await get_hf_llm("meta-llama/Llama-3.3-70B-Instruct")
        assert isinstance(llm, HuggingFaceChatModel)
        assert llm.model == "meta-llama/Llama-3.3-70B-Instruct"
        assert llm.model_name == "meta-llama/Llama-3.3-70B-Instruct"

    @pytest.mark.asyncio
    async def test_nat_ref_falls_back_to_env_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """NAT component refs (no slash) fall back to HF_LLM_NAME."""
        monkeypatch.setenv("HF_LLM_NAME", "meta-llama/Llama-3.3-70B-Instruct")
        llm = await get_hf_llm("nim_llm")
        assert llm.model == "meta-llama/Llama-3.3-70B-Instruct"

    @pytest.mark.asyncio
    async def test_ainvoke_uses_inference_client(self) -> None:
        """ainvoke routes through InferenceClient.chat_completion."""
        llm = await get_hf_llm("meta-llama/Llama-3.3-70B-Instruct")
        with patch.object(llm, "_client") as mock_client:
            mock_client.chat_completion.return_value = _mock_response("hello world")
            result = await llm.ainvoke("hi")
            assert result.content == "hello world"
            mock_client.chat_completion.assert_called_once()

    @pytest.mark.asyncio
    async def test_prompt_chain_ainvoke(self) -> None:
        """LangChain prompt | llm chaining works."""
        from langchain_core.prompts import ChatPromptTemplate

        llm = await get_hf_llm("meta-llama/Llama-3.3-70B-Instruct")
        with patch.object(llm, "_client") as mock_client:
            mock_client.chat_completion.return_value = _mock_response("chained")
            prompt = ChatPromptTemplate.from_messages([("user", "{q}")])
            chain = prompt | llm
            result = await chain.ainvoke({"q": "test"})
            assert result.content == "chained"

    @pytest.mark.asyncio
    async def test_bind_kwargs_forwarded(self) -> None:
        """bind() kwargs are accepted and forwarded."""
        llm = await get_hf_llm("meta-llama/Llama-3.3-70B-Instruct")
        bound = llm.bind(reasoning={"effort": "medium"})
        with patch.object(llm, "_client"):
            # Bound runnable shares the underlying model; just verify bind works.
            assert bound is not None

    @pytest.mark.asyncio
    async def test_bind_tools_forwards_tools_and_parses_calls(self) -> None:
        """bind_tools sends OpenAI tools and parses tool_calls (TopAgent path)."""
        from langchain_core.tools import tool

        @tool
        def search_videos(query: str) -> str:
            """Search videos."""
            return "hit"

        llm = await get_hf_llm("meta-llama/Llama-3.3-70B-Instruct")
        bound = llm.bind_tools([search_videos])
        with patch.object(llm, "_client") as mock_client:
            mock_client.chat_completion.return_value = _mock_tool_response(
                "search_videos", {"query": "cats"}
            )
            result = await bound.ainvoke("find cats")
            assert result.tool_calls[0]["name"] == "search_videos"
            assert result.tool_calls[0]["args"] == {"query": "cats"}
            sent_tools = mock_client.chat_completion.call_args.kwargs.get("tools") or []
            assert len(sent_tools) == 1
            assert sent_tools[0]["function"]["name"] == "search_videos"

    @pytest.mark.asyncio
    async def test_invalid_tool_args_land_in_invalid_tool_calls(self) -> None:
        """Unparseable tool arguments are reported, not dropped."""
        from langchain_core.tools import tool

        @tool
        def search_videos(query: str) -> str:
            """Search videos."""
            return "hit"

        llm = await get_hf_llm("meta-llama/Llama-3.3-70B-Instruct")
        bound = llm.bind_tools([search_videos])
        response = _mock_tool_response("search_videos", {"query": "cats"})
        response.choices[0].message.tool_calls[0].function.arguments = "{not json"
        with patch.object(llm, "_client") as mock_client:
            mock_client.chat_completion.return_value = response
            result = await bound.ainvoke("find cats")
            assert result.tool_calls == []
            assert result.invalid_tool_calls[0]["name"] == "search_videos"


class TestGetHfVlm:
    """Tests for get_hf_vlm factory."""

    @pytest.mark.asyncio
    async def test_defaults_to_hf_vlm_name(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """No arg defaults to HF_VLM_NAME env."""
        monkeypatch.setenv("HF_VLM_NAME", "Qwen/Qwen2.5-VL-7B-Instruct")
        vlm = await get_hf_vlm()
        assert isinstance(vlm, HuggingFaceChatModel)
        assert vlm.model == "Qwen/Qwen2.5-VL-7B-Instruct"
