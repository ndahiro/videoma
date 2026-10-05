"""
Entry point for running the VSS agent.

Production (NVIDIA Agent Toolkit):
    nat serve <config.yml>

Development (standalone FastAPI without NAT):
    uvicorn vss_agents.api:app --host 0.0.0.0 --port 8000 --reload
    python -m vss_agents          # starts uvicorn on 0.0.0.0:8000
"""

import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)

logger = logging.getLogger(__name__)

if __name__ == "__main__":
    import uvicorn  # noqa: PLC0415

    logger.info(
        "Starting VSS Agent in standalone dev mode (without NAT). "
        "Configure via environment variables (VST_INTERNAL_URL, etc.)."
    )
    uvicorn.run(
        "vss_agents.api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
