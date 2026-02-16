---
layout: default
title: Guides - Quick Start
---

# 🧭 Guide Quick Start: Run the Web App

## Step 1: Launch the Backend

```bash
python3 serve.py
```

Wait for the console to report `Serving HTTP on 0.0.0.0 port 8000`.

## Step 2: Open the Interface

Visit [http://localhost:8000](http://localhost:8000) in any modern browser. The landing view shows:
- The Fano plane with seven vibrant points
- Control sliders for hue, saturation, and brightness
- A trace panel that records sensor input

## Step 3: Interact with the Gate

Hover over any point to read its HD wallet path and rational ratio, then click to highlight the point's line. Every interaction emits an NDJSON event for auditing.

## Step 4: Playback a Trace

Grab `wisdom-fractal.ndjson` from `docs/assets/demos` and click "Load Canon" inside the app. The Viewer will replay the 77-frame canon.

## Step 5: Extend the Scene

The dev console exposes a few commands:
- `window.lightgarden.reset()` resets the canon
- `window.lightgarden.loadLine(n)` flashes line `n` from the Fano plane
- `window.lightgarden.exportTrace()` dumps a JSON trace

[Back to guides overview →](/guides/)
