---
layout: default
title: Build a Hexagonal Dome
---

# 🏗️ Build the Physical Hexagonal Dome

The dome is a geodesic, hexagonal grid of LEDs that mirrors the Fano plane in three dimensions.

## Materials
- PVC connectors and ribs (6 foot lengths)
- 7-bit LED strips for the apex
- ESP32 or ESP8266 microcontroller
- 5V power supply and signal wiring
- Zip ties, diffusion film, and a transparent dome cover

## Assembly Steps
1. Build a hex ring for the base and anchor it to a rotating stand.
2. Stack concentric hexagons upward, bundling LEDs along each edge.
3. Mount the ESP32 at the center and connect each LED address to the proper GPIO pin.
4. Apply diffusion film so the light bleeds smoothly between the points.
5. Flash the firmware (see `/guides/esp32-firmware`) and point the dome toward the dome viewer to sync IR.

## Tips
- Label every cable with the HD path it represents to avoid miswiring.
- Use the `dome-viewer.js` script to visualize the dome before powering the LEDs.
