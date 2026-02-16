---
layout: default
title: Flash ESP32 Firmware
---

# 🧬 Flashing ESP32 Nodes

Prepare any $3 ESP32 as a Light Garden node.

## Build the Firmware
1. Open `firmware/minimal_probe.h` and confirm the sensor pins.
2. Use `platformio` or `esp-idf` to compile the sketch. The header abstracts LoRa, BLE, or WiFi transports.
3. The build emits a binary that listens for NDJSON traces over UART and translates them into LED updates.

## Flashing
```bash
esptool.py --chip esp32 --port /dev/ttyUSB0 write_flash -z 0x1000 firmware.bin
```

## Connect Nodes
- Pair the node with the web viewer via WebSocket.
- The node publishes its HD path and line number every second.
- Listen to `mqtt-config.md` to tune LoRa relays.

## Debugging
- Use `miniterm` to open the node console.
- The node reports `Line: X, Angle: Y` whenever the line changes.
