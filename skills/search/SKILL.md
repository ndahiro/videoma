---
name: video-search
description: Natural language semantic search across video archives
version: 1.0.0
type: skill
author: NVIDIA VSS Blueprint
compatible_agents:
  - vss-agent
inputs:
  - name: query
    type: string
    description: Natural language search query
    required: true
  - name: video_ids
    type: array
    items: string
    description: Optional list of video IDs to narrow the search scope
    required: false
  - name: top_k
    type: integer
    description: Number of top results to return (default 5)
    required: false
outputs:
  - name: results
    type: array
    items:
      type: object
      properties:
        video_id: string
        video_name: string
        score: number
        timestamp_start: number
        timestamp_end: number
        description: string
        thumbnail_url: string
dependencies:
  - vss-agent (v1.0.0)
---

# Video Search

This skill enables natural language semantic search across video archives using VLM-powered embeddings. It searches through video content, not just metadata.

## Usage

POST /api/search

```json
{
  "query": "Find scenes with red cars",
  "video_ids": ["vid-123", "vid-456"],
  "top_k": 5
}
```

## Implementation Details

- Uses VLM embeddings (cosmos-reason2-8b) for semantic search
- Falls back to mock results when VSS agent is unavailable
- Results include timestamps for direct video navigation
