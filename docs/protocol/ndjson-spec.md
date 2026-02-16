---
layout: default
title: NDJSON Trace Specification
---

# 🧾 NDJSON Trace Specification

Every interaction with Light Garden produces an NDJSON line. Each event records the LED matrix, the Fano line, and the angle so you can replay the entire canon:

```json
{
  "timestamp": "2025-04-01T12:00:00Z",
  "line": 3,
  "points": [1, 5, 6],
  "angle": 51.428571,
  "matrix": [[0,1,2],[3,4,5],[6,7,8]]
}
```

Fields:
- `timestamp`: UTC ISO string
- `line`: the Fano line number (1-7)
- `points`: the three points on that line
- `angle`: the hue in degrees (rational when possible)
- `matrix`: LED matrix codes (sheet + ring)

Use `curl` or `wget` to stream the trace, then drop it into the web viewer for reruns or debugging.
