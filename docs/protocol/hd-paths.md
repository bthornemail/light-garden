---
layout: default
title: HD Wallet Addressing
---

# 💳 HD Wallet Paths for Light Garden

Light Garden borrows BIP32-style paths so every LED or dome can be traced globally. The format is:

```
m / purpose' / ring' / led' / dimension'
```

- `purpose 240'` marks the Light Garden namespace.
- `ring` indicates physical ring (1 for 7-bit, up to 9 for 241-bit).
- `led` denotes the LED index within the ring.
- `dimension` encodes the color band or sensory input.

Example: `m/240'/2'/1'/5'` means the user is on the second ring, first LED, fifth dimension (often hue or brightness). These paths are surfaced in the UI and logged in NDJSON traces for forensic audits.
