---
layout: default
title: Federation Protocol
---

# 🤝 Federation Protocol

Light Garden federates across continents by sharing **line numbers** and keeping differentials secret. The handshake is simple:

1. Each node announces the **Fano line** it is currently exploring.
2. The receiving node validates the timestamp and the HD path for trust.
3. Nodes never exchange raw matrices; they keep the differential local to their computation.
4. Any node can replay a shared trace by pairing the line number with its own differential.

This keeps every federation lightweight yet verifiable — partners only need to agree on the line, not the exact colors.
