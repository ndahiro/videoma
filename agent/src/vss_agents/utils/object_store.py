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

from typing import Any


def resolve_object_store_url(object_store: Any, filename: str, base_url: str) -> str:
    """
    Get HTTP URL for a file from any object store type.

    Supports:
    - S3/MinIO object store (construct URL from endpoint)
    - in_memory and other stores (use NAT file server /static/ endpoint)

    Args:
        object_store: The object store instance
        filename: The file key/name
        base_url: Fallback base URL (e.g. from the tool config) for
            non-S3 stores

    Returns:
        str: HTTP URL to access the file
    """
    # S3/MinIO object store - construct URL from attributes
    if hasattr(object_store, "endpoint_url") and hasattr(object_store, "bucket_name"):
        endpoint = object_store.endpoint_url
        bucket = object_store.bucket_name
        # Remove trailing slash from endpoint
        endpoint = endpoint.rstrip("/")
        return f"{endpoint}/{bucket}/{filename}"

    # For in_memory and other stores - use NAT's /static/ endpoint from config
    # The file server is configured via general.front_end.object_store
    # Remove trailing slash and construct URL
    return f"{base_url.rstrip('/')}/{filename}"
