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
#
# NVIDIA CORPORATION, its affiliates and licensors retain all intellectual
# property and proprietary rights in and to this material, related
# documentation and any modifications thereto. Any use, reproduction,
# disclosure or distribution of this material and related documentation
# without an express license agreement from NVIDIA CORPORATION or
# its affiliates is strictly prohibited.

"""
VSS Agent API — standalone FastAPI application for development without NAT.

In production, the FastAPI app is created by the NVIDIA Agent Toolkit (NAT)
via ``nat serve <config.yml>``. This module provides a standalone FastAPI app
that can be served directly with uvicorn for development:

    uvicorn vss_agents.api:app --host 0.0.0.0 --port 8000 --reload

Routes are registered conditionally based on environment variables
(e.g., ``VST_INTERNAL_URL``, ``ELASTIC_SEARCH_ENDPOINT``).
"""

import logging
import os

from fastapi import FastAPI

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Create and configure a standalone FastAPI app for development.

    Returns:
        FastAPI: Fully configured FastAPI application instance.
    """
    app = FastAPI(
        title="VSS Agent (Dev Mode)",
        description=(
            "Video Search and Summarization Agent API — "
            "standalone dev mode without NVIDIA Agent Toolkit"
        ),
        version="0.1.0",
    )

    # ── Health endpoint ────────────────────────────────────────────────
    @app.get("/health", include_in_schema=False)
    async def health_check():
        return {"isAlive": True}

    logger.info("Registered /health endpoint")

    # ── Streaming video ingest routes ──────────────────────────────────
    # Requires VST_INTERNAL_URL to be set (empty = skip)
    vst_internal_url = os.getenv("VST_INTERNAL_URL", "")
    if vst_internal_url:
        try:
            from vss_agents.api.video_search_ingest import (  # noqa: PLC0415
                create_streaming_video_ingest_router,
            )

            host_ip = os.getenv("HOST_IP", "127.0.0.1")
            rtvi_embed_port = os.getenv("RTVI_EMBED_PORT", "8017")
            rtvi_cv_port = os.getenv("RTVI_CV_PORT", "")
            rtvi_embed_model = os.getenv("RTVI_EMBED_MODEL", "cosmos-embed1-448p")
            rtvi_embed_chunk_duration = int(os.getenv("RTVI_EMBED_CHUNK_DURATION", "5"))

            router = create_streaming_video_ingest_router(
                vst_internal_url=vst_internal_url,
                rtvi_embed_base_url=f"http://{host_ip}:{rtvi_embed_port}",
                rtvi_cv_base_url=(
                    f"http://{host_ip}:{rtvi_cv_port}" if rtvi_cv_port else ""
                ),
                rtvi_embed_model=rtvi_embed_model,
                rtvi_embed_chunk_duration=rtvi_embed_chunk_duration,
            )
            app.include_router(router)
            logger.info("Registered streaming video ingest routes")
        except Exception as exc:
            logger.warning(
                "Skipping video ingest routes (VST_INTERNAL_URL set but setup failed): %s",
                exc,
            )
    else:
        logger.info(
            "VST_INTERNAL_URL not set — skipping streaming video ingest routes"
        )

    # ── Video delete routes ────────────────────────────────────────────
    if vst_internal_url:
        try:
            from vss_agents.api.video_delete import (  # noqa: PLC0415
                create_video_delete_router,
            )

            host_ip = os.getenv("HOST_IP", "127.0.0.1")
            rtvi_cv_port = os.getenv("RTVI_CV_PORT", "")
            elasticsearch_url = os.getenv("ELASTIC_SEARCH_ENDPOINT", "")
            stream_mode = os.getenv("STREAM_MODE", "search")

            router = create_video_delete_router(
                vst_internal_url=vst_internal_url,
                elasticsearch_url=elasticsearch_url,
                rtvi_cv_base_url=(
                    f"http://{host_ip}:{rtvi_cv_port}" if rtvi_cv_port else ""
                ),
                stream_mode=stream_mode,
            )
            app.include_router(router)
            logger.info("Registered video delete routes")
        except Exception as exc:
            logger.warning(
                "Skipping video delete routes (VST_INTERNAL_URL set but setup failed): %s",
                exc,
            )

    # ── RTSP stream management routes ──────────────────────────────────
    if vst_internal_url:
        try:
            from vss_agents.api.rtsp_stream_api import (  # noqa: PLC0415
                create_rtsp_stream_api_router,
            )

            host_ip = os.getenv("HOST_IP", "127.0.0.1")
            rtvi_embed_port = os.getenv("RTVI_EMBED_PORT", "8017")
            rtvi_cv_port = os.getenv("RTVI_CV_PORT", "")
            rtvi_embed_model = os.getenv("RTVI_EMBED_MODEL", "cosmos-embed1-448p")
            rtvi_embed_chunk_duration = int(os.getenv("RTVI_EMBED_CHUNK_DURATION", "5"))
            stream_mode = os.getenv("STREAM_MODE", "search")

            router = create_rtsp_stream_api_router(
                vst_internal_url=vst_internal_url,
                rtvi_cv_base_url=(
                    f"http://{host_ip}:{rtvi_cv_port}" if rtvi_cv_port else ""
                ),
                rtvi_embed_base_url=f"http://{host_ip}:{rtvi_embed_port}",
                rtvi_embed_model=rtvi_embed_model,
                rtvi_embed_chunk_duration=rtvi_embed_chunk_duration,
                default_stream_mode=stream_mode,
            )
            app.include_router(router)
            logger.info("Registered RTSP stream API routes")
        except Exception as exc:
            logger.warning(
                "Skipping RTSP stream routes (VST_INTERNAL_URL set but setup failed): %s",
                exc,
            )

    # ── CORS middleware ────────────────────────────────────────────────
    from fastapi.middleware.cors import CORSMiddleware  # noqa: PLC0415

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return app


# Export the app instance for uvicorn
app = create_app()
