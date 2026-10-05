---
name: video-query
description: Ask natural language questions about video content
version: 1.0.0
type: skill
author: NVIDIA VSS Blueprint
compatible_agents:
  - vss-agent
inputs:
  - name: question
    type: string
    description: Natural language question about video content
    required: true
  - name: video_ids
    type: array
    items: string
    description: Optional list of video IDs to scope the question
    required: false
outputs:
  - name: question
    type: string
  - name: answer
    type: string
  - name: sources
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
  - name: elapsed_ms
    type: number
dependencies:
  - vss-agent (v1.0.0)
---

# Video Query

Enables natural language Q&A over video content. Ask questions about events, dialogue, visual concepts, and more.

## Usage

POST /api/query

```json
{
  "question": "What color was the car in the second scene?",
  "video_ids": ["vid-123"]
}
```

## Implementation

- Question is processed by the VSS agent using VLM for visual understanding
- Sources are provided with timestamps for verification
- Falls back gracefully when VSS agent is unavailable
