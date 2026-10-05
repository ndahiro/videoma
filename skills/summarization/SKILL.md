---
name: video-summarization
description: Generate intelligent summaries of video content
version: 1.0.0
type: skill
author: NVIDIA VSS Blueprint
compatible_agents:
  - vss-agent
inputs:
  - name: video_id
    type: string
    description: ID of the video to summarize
    required: true
  - name: style
    type: string
    description: Summary style (brief, detailed, bullet_points)
    enum: [brief, detailed, bullet_points]
    default: detailed
    required: false
outputs:
  - name: video_id
    type: string
  - name: video_name
    type: string
  - name: summary
    type: string
  - name: elapsed_ms
    type: number
dependencies:
  - vss-agent (v1.0.0)
---

# Video Summarization

Generates intelligent summaries of video content using VLM and LLM collaboration.

## Usage

POST /api/summarize

```json
{
  "video_id": "vid-123",
  "style": "detailed"
}
```

## Supported Styles

- **brief**: A short 2-3 sentence overview
- **detailed**: A comprehensive paragraph covering key events
- **bullet_points**: Key points formatted as bullet items
