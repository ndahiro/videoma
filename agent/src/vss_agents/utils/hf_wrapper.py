
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

"""
Hugging Face LLM wrapper.

Provides a drop-in replacement for ``builder.get_llm()`` that returns a
LangChain ``BaseChatModel`` backed by ``huggingface_hub.InferenceClient``.

Environment variables used
--------------------------
HF_TOKEN              - Hugging Face API token (required for gated models).
HF_BASE_URL           - Base URL for the HF inference router.
                        Default: https://router.huggingface.co/hf-inference/v1
HF_LLM_NAME           - Default LLM model id (fallback when none is passed).
                        Default: meta-llama/Llama-3.3-70B-Instruct
HF_VLM_NAME           - Default VLM model id.
                        Default: Qwen/Qwen2.5-VL-7B-Instruct
"""

import asyncio
from collections.abc import Sequence
import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from huggingface_hub import InferenceClient
from langchain_core.callbacks import AsyncCallbackManagerForLLMRun
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.messages import BaseMessage
from langchain_core.outputs import ChatGeneration
from langchain_core.outputs import ChatResult
from langchain_core.runnables import RunnableBinding
from langchain_core.utils.function_calling import convert_to_openai_tool
from pydantic import Field
from pydantic import PrivateAttr

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Defaults - can be overridden via env vars or function arguments
# ---------------------------------------------------------------------------
_DEFAULT_BASE_URL = "https://router.huggingface.co/hf-inference/v1"
_DEFAULT_LLM_MODEL = "meta-llama/Llama-3.3-70B-Instruct"
_DEFAULT_VLM_MODEL = "Qwen/Qwen2.5-VL-7B-Instruct"

_DEFAULT_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
_DEFAULT_NIM_LLM_MODEL = "nvidia/nemotron-nano-9b-v2"
_DEFAULT_NIM_VLM_MODEL = "nvidia/cosmos-reason2-8b"


def _resolve_model_type(env_var: str = "LLM_MODEL_TYPE", model_name: str | None = None) -> str:
    """Return model type: 'nim', 'openai', 'vllm', 'ollama', or 'hf'."""
    if model_name:
        name_lower = model_name.lower()
        if any(h in name_lower for h in ("meta-llama", "qwen", "mistralai", "llama-3", "all-minilm")):
            return "hf"
        if any(n in name_lower for n in ("cosmos", "nemotron")):
            return "nim"
        if name_lower in ("hf_llm", "huggingface_llm", "hf_vlm", "huggingface_vlm"):
            return "hf"
        if name_lower in ("nim_llm", "nim_vlm"):
            if not os.getenv("NVIDIA_API_KEY") and (os.getenv("HF_TOKEN") or os.getenv("HF_LLM_NAME") or os.getenv("HF_VLM_NAME")):
                return "hf"
            return "nim"

    raw = os.getenv(env_var, "").lower().strip()
    if raw in ("nim", "nvidia", "cosmos"):
        if not os.getenv("NVIDIA_API_KEY") and (os.getenv("HF_TOKEN") or os.getenv("HF_LLM_NAME") or os.getenv("HF_VLM_NAME")):
            return "hf"
        return "nim"
    if raw in ("openai", "vllm", "ollama"):
        return "openai"
    if raw in ("hf", "huggingface"):
        return "hf"
    if os.getenv("NVIDIA_API_KEY") and not os.getenv("HF_TOKEN"):
        return "nim"
    return "hf"


def _resolve_base_url() -> str:
    """Return the HF inference base URL from env or default."""
    return (os.getenv("HF_BASE_URL") or os.getenv("LLM_BASE_URL") or _DEFAULT_BASE_URL).rstrip("/")


def _resolve_vlm_base_url() -> str:
    """Return the HF inference base URL for VLM from env or default."""
    return (os.getenv("VLM_BASE_URL") or os.getenv("HF_BASE_URL") or _DEFAULT_BASE_URL).rstrip("/")


def _resolve_nim_base_url() -> str:
    """Return the NIM/OpenAI inference base URL from env or default."""
    url = (os.getenv("LLM_BASE_URL") or _DEFAULT_NIM_BASE_URL).rstrip("/")
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return url


def _resolve_nim_vlm_base_url() -> str:
    """Return the NIM/OpenAI inference base URL for VLM from env or default."""
    url = (os.getenv("VLM_BASE_URL") or os.getenv("LLM_BASE_URL") or _DEFAULT_NIM_BASE_URL).rstrip("/")
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return url


def _resolve_api_key() -> str:
    """Return the HF API key from env or empty string."""
    return os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_API_KEY") or os.getenv("OPENAI_API_KEY") or ""


def _resolve_nim_api_key() -> str:
    """Return the NVIDIA or OpenAI API key from env."""
    return os.getenv("NVIDIA_API_KEY") or os.getenv("OPENAI_API_KEY") or "not-needed"


def _resolve_llm_model(model_name: str | None) -> str:
    """Resolve the LLM model id from arg, env, or default."""
    if model_name and "/" in model_name:
        return model_name
    return os.getenv("HF_LLM_NAME") or os.getenv("LLM_NAME") or _DEFAULT_LLM_MODEL


def _resolve_nim_llm_model(model_name: str | None) -> str:
    """Resolve the NIM/Cosmos LLM model id from arg, env, or default."""
    if model_name and "/" in model_name:
        return model_name
    return os.getenv("LLM_NAME") or _DEFAULT_NIM_LLM_MODEL


def _resolve_vlm_model(model_name: str | None) -> str:
    """Resolve the VLM model id from arg, env, or default."""
    if model_name and "/" in model_name:
        return model_name
    return os.getenv("HF_VLM_NAME") or os.getenv("VLM_NAME") or _DEFAULT_VLM_MODEL


def _resolve_nim_vlm_model(model_name: str | None) -> str:
    """Resolve the NIM/Cosmos VLM model id from arg, env, or default."""
    if model_name and "/" in model_name:
        return model_name
    return os.getenv("VLM_NAME") or _DEFAULT_NIM_VLM_MODEL


def _message_to_openai_dict(message: BaseMessage) -> dict[str, Any]:
    """Convert a LangChain message to an OpenAI-compatible dict.

    Content may be a plain string or a list of content blocks
    (text / image_url / video_url). Blocks are passed through so
    vision-language models receive images unchanged.
    """
    role = "user"
    message_type = type(message).__name__
    if message_type == "SystemMessage":
        role = "system"
    elif message_type == "AIMessage":
        role = "assistant"
    elif message_type == "ToolMessage":
        role = "tool"

    content: Any = message.content  # Any justified: LangChain content blocks vary by provider.
    if isinstance(content, str):
        return {"role": role, "content": content}
    if isinstance(content, list):
        blocks: list[dict[str, Any]] = []
        for block in content:
            if isinstance(block, dict):
                blocks.append(block)
            elif isinstance(block, str):
                blocks.append({"type": "text", "text": block})
            else:
                text_obj: Any = getattr(block, "text", None)
                if isinstance(text_obj, str):
                    blocks.append({"type": "text", "text": text_obj})
                else:
                    blocks.append({"type": "text", "text": str(block)})
        return {"role": role, "content": blocks}
    return {"role": role, "content": str(content)}


class HuggingFaceChatModel(BaseChatModel):
    """LangChain chat model backed by ``huggingface_hub.InferenceClient``.

    Thin wrapper around ``InferenceClient`` exposing the ``BaseChatModel``
    interface (``invoke`` / ``ainvoke`` / ``bind`` / ``|`` chaining) so it
    is a drop-in replacement for ``builder.get_llm(..., wrapper_type=...)``.
    """

    model: str = Field(description="Hugging Face model repo id.")
    temperature: float = Field(default=0.0, description="Sampling temperature.")
    max_tokens: int = Field(default=4096, description="Max tokens to generate.")
    base_url: str = Field(default=_DEFAULT_BASE_URL, description="HF inference base URL.")
    api_key: str = Field(default="", description="HF API token.")

    _client: InferenceClient = PrivateAttr()

    def __init__(
        self,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        base_url: str | None = None,
        api_key: str | None = None,
        **kwargs: Any,
    ) -> None:
        resolved_model = _resolve_llm_model(model)
        resolved_base_url = (base_url or _resolve_base_url()).rstrip("/")
        resolved_api_key = api_key if api_key is not None else _resolve_api_key()
        super().__init__(  # type: ignore[call-arg]
            model=resolved_model,
            temperature=temperature,
            max_tokens=max_tokens,
            base_url=resolved_base_url,
            api_key=resolved_api_key,
            **kwargs,
        )
        # Any is justified: InferenceClient is an external SDK type without stubs.
        # Note: InferenceClient treats `base_url` as an alias for `model`
        # (OpenAI compatibility), so do not pass both. When using the
        # default HF router, init with token only and pass model per-request.
        # For a custom endpoint, init with base_url + token, model per-request.
        if resolved_base_url != _DEFAULT_BASE_URL:
            self._client = InferenceClient(
                base_url=resolved_base_url,
                token=self.api_key or None,
            )
        else:
            self._client = InferenceClient(token=self.api_key or None)

    @property
    def _llm_type(self) -> str:
        """Return the LLM type string."""
        return "huggingface-chat"

    @property
    def _identifying_params(self) -> dict[str, Any]:
        """Return identifying params for tracing."""
        return {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "base_url": self.base_url,
        }

    @property
    def model_name(self) -> str:
        """Alias for ``model`` for compatibility with ChatOpenAI code."""
        return self.model

    @property
    def openai_api_base(self) -> str:
        """Alias for ``base_url`` for compatibility checks (e.g. is_hf)."""
        return self.base_url

    def _parse_tool_calls(self, message: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Parse OpenAI-style tool calls from an InferenceClient response message.

        Returns (tool_calls, invalid_tool_calls) in LangChain AIMessage format.
        """
        raw_calls = getattr(message, "tool_calls", None) or []
        tool_calls: list[dict[str, Any]] = []
        invalid_tool_calls: list[dict[str, Any]] = []
        for call in raw_calls:
            if isinstance(call, dict):
                call_id = call.get("id")
                function = call.get("function") or {}
                name = function.get("name", "") if isinstance(function, dict) else ""
                arguments = function.get("arguments", "{}") if isinstance(function, dict) else "{}"
            else:
                call_id = getattr(call, "id", None)
                function = getattr(call, "function", None)
                name = getattr(function, "name", "") if function is not None else ""
                arguments = getattr(function, "arguments", "{}") if function is not None else "{}"
            if isinstance(arguments, str):
                try:
                    args = json.loads(arguments) if arguments.strip() else {}
                except json.JSONDecodeError as e:
                    invalid_tool_calls.append(
                        {
                            "name": name,
                            "args": arguments,
                            "id": call_id,
                            "error": f"JSON decode error: {e}",
                        }
                    )
                    continue
            elif isinstance(arguments, dict):
                args = arguments
            else:
                args = {}
            tool_calls.append({"name": name, "args": args, "id": call_id, "type": "tool_call"})
        return tool_calls, invalid_tool_calls

    def _message_to_ai_message(self, message: Any) -> AIMessage:
        """Convert an InferenceClient response message to a LangChain AIMessage."""
        content = getattr(message, "content", "") if message is not None else ""
        if content is None:
            text = ""
        elif isinstance(content, str):
            text = content
        elif isinstance(content, list):
            parts: list[str] = []
            for part in content:
                if isinstance(part, dict):
                    parts.append(str(part.get("text", part)))
                elif isinstance(part, str):
                    parts.append(part)
                else:
                    part_text: Any = getattr(part, "text", None)
                    parts.append(str(part_text) if part_text is not None else str(part))
            text = "".join(parts)
        else:
            text = str(content)
        tool_calls, invalid_tool_calls = self._parse_tool_calls(message)
        return AIMessage(content=text, tool_calls=tool_calls, invalid_tool_calls=invalid_tool_calls)

    def bind_tools(
        self,
        tools: Sequence[Any],
        *,
        tool_choice: str | dict[str, Any] | bool | None = None,
        **kwargs: Any,
    ) -> RunnableBinding[Any, AIMessage]:
        """Bind tools for OpenAI-compatible function calling via the HF router.

        Tools are converted to OpenAI format and forwarded to
        ``InferenceClient.chat_completion``; responses carrying tool calls are
        parsed back into ``AIMessage.tool_calls``. This powers agent tool use
        (``TopAgent``) and ``with_structured_output`` judges.
        """
        openai_tools = [convert_to_openai_tool(tool) for tool in tools]
        bind_kwargs: dict[str, Any] = {"tools": openai_tools}
        if tool_choice is not None:
            bind_kwargs["tool_choice"] = tool_choice
        bind_kwargs.update(kwargs)
        return RunnableBinding(bound=self, kwargs=bind_kwargs)

    def _call_inference_client(
        self,
        openai_messages: list[dict[str, Any]],
        stop: list[str] | None,
        run_kwargs: dict[str, Any],
    ) -> AIMessage:
        """Call ``InferenceClient.chat_completion`` and return an AIMessage."""
        temperature = run_kwargs.pop("temperature", self.temperature)
        max_tokens = run_kwargs.pop("max_tokens", self.max_tokens)
        tools = run_kwargs.pop("tools", None)
        tool_choice = run_kwargs.pop("tool_choice", None)
        response_format = run_kwargs.pop("response_format", None)
        # Merge LangChain bind kwargs (reasoning, extra_body, mm_*, media_*) into extra_body.
        extra_body: dict[str, Any] = {}
        existing_extra = run_kwargs.pop("extra_body", None)
        if isinstance(existing_extra, dict):
            extra_body.update(existing_extra)
        for key in ("reasoning", "chat_template_kwargs", "mm_processor_kwargs", "media_io_kwargs"):
            if key in run_kwargs:
                extra_body[key] = run_kwargs.pop(key)
        # Drop NIM/Cosmos-only kwargs that HF router does not accept.
        run_kwargs.pop("reasoning_effort", None)

        response = self._client.chat_completion(
            messages=openai_messages,
            model=self.model,
            temperature=temperature,
            max_tokens=max_tokens,
            stop=stop,
            tools=tools,
            tool_choice=tool_choice,
            response_format=response_format,
            extra_body=extra_body or None,
            **run_kwargs,
        )
        # Non-streaming returns ChatCompletionOutput.
        choices = getattr(response, "choices", [])
        if not choices:
            return AIMessage(content="")
        return self._message_to_ai_message(getattr(choices[0], "message", None))

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        """Generate a chat response via ``InferenceClient``."""
        del run_manager
        openai_messages = [_message_to_openai_dict(m) for m in messages]
        try:
            ai_message = self._call_inference_client(openai_messages, stop, dict(kwargs))
        except Exception as e:
            logger.error("HuggingFace inference call failed for model %s: %s", self.model, e)
            raise
        return ChatResult(generations=[ChatGeneration(message=ai_message)])

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        """Async generate by running the sync ``InferenceClient`` call in a thread."""
        del run_manager
        openai_messages = [_message_to_openai_dict(m) for m in messages]
        try:
            ai_message = await asyncio.to_thread(self._call_inference_client, openai_messages, stop, dict(kwargs))
        except Exception as e:
            logger.error("HuggingFace async inference call failed for model %s: %s", self.model, e)
            raise
        return ChatResult(generations=[ChatGeneration(message=ai_message)])


async def get_hf_llm(
    model_name: str | None = None,
    *,
    temperature: float = 0.0,
    max_tokens: int = 4096,
    base_url: str | None = None,
    api_key: str | None = None,
    **kwargs: Any,
) -> BaseChatModel:
    """Return a LangChain chat model backed by NIM, OpenAI, or Hugging Face.

    Automatically routes to NVIDIA NIM API Catalog, self-hosted NIM/vLLM, or
    HuggingFace InferenceClient based on the ``LLM_MODEL_TYPE`` env var.
    """
    model_type = _resolve_model_type("LLM_MODEL_TYPE", model_name)

    if model_type in ("nim", "openai"):
        resolved_model = _resolve_nim_llm_model(model_name)
        resolved_base_url = (base_url or _resolve_nim_base_url()).rstrip("/")
        resolved_api_key = api_key if api_key is not None else _resolve_nim_api_key()

        logger.info(
            "Creating %s LLM: model=%s, base_url=%s",
            model_type.upper(),
            resolved_model,
            resolved_base_url,
        )

        if model_type == "nim":
            try:
                from langchain_nvidia_ai_endpoints import ChatNVIDIA
                return ChatNVIDIA(
                    model=resolved_model,
                    base_url=resolved_base_url,
                    api_key=resolved_api_key,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    **kwargs,
                )
            except (ImportError, Exception) as exc:
                logger.debug("ChatNVIDIA unavailable (%s); using ChatOpenAI for NIM endpoint", exc)

        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=resolved_model,
            base_url=resolved_base_url,
            api_key=resolved_api_key,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )

    # Hugging Face fallback
    resolved_model = _resolve_llm_model(model_name)
    resolved_base_url = (base_url or _resolve_base_url()).rstrip("/")
    resolved_api_key = api_key if api_key is not None else _resolve_api_key()

    logger.info(
        "Creating HuggingFace LLM: model=%s, base_url=%s",
        resolved_model,
        resolved_base_url,
    )

    return HuggingFaceChatModel(
        model=resolved_model,
        temperature=temperature,
        max_tokens=max_tokens,
        base_url=resolved_base_url,
        api_key=resolved_api_key,
        **kwargs,
    )


async def get_hf_vlm(
    model_name: str | None = None,
    *,
    temperature: float = 0.0,
    max_tokens: int = 4096,
    base_url: str | None = None,
    api_key: str | None = None,
    **kwargs: Any,
) -> BaseChatModel:
    """Return a LangChain chat model for VLM tasks (vision-language).

    Automatically routes to NVIDIA Cosmos (NIM API Catalog or self-hosted) or
    Hugging Face based on the ``VLM_MODEL_TYPE`` env var.
    """
    model_type = _resolve_model_type("VLM_MODEL_TYPE")

    if model_type in ("nim", "openai"):
        resolved_model = _resolve_nim_vlm_model(model_name)
        resolved_base_url = (base_url or _resolve_nim_vlm_base_url()).rstrip("/")
        resolved_api_key = api_key if api_key is not None else _resolve_nim_api_key()

        logger.info(
            "Creating %s VLM: model=%s, base_url=%s",
            model_type.upper(),
            resolved_model,
            resolved_base_url,
        )

        if model_type == "nim":
            try:
                from langchain_nvidia_ai_endpoints import ChatNVIDIA
                return ChatNVIDIA(
                    model=resolved_model,
                    base_url=resolved_base_url,
                    api_key=resolved_api_key,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    **kwargs,
                )
            except (ImportError, Exception) as exc:
                logger.debug("ChatNVIDIA unavailable (%s); using ChatOpenAI for NIM VLM", exc)

        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=resolved_model,
            base_url=resolved_base_url,
            api_key=resolved_api_key,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )

    # Hugging Face fallback
    resolved_model = _resolve_vlm_model(model_name)
    resolved_base_url = (base_url or _resolve_vlm_base_url()).rstrip("/")
    resolved_api_key = api_key if api_key is not None else _resolve_api_key()

    logger.info(
        "Creating HuggingFace VLM: model=%s, base_url=%s",
        resolved_model,
        resolved_base_url,
    )

    return HuggingFaceChatModel(
        model=resolved_model,
        temperature=temperature,
        max_tokens=max_tokens,
        base_url=resolved_base_url,
        api_key=resolved_api_key,
        **kwargs,
    )


# Canonical aliases
get_llm = get_hf_llm
get_vlm = get_hf_vlm

