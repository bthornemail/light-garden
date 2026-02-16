# Interplanetary Fano Communication Demo

A replayable NDJSON trace demonstrating document transmission from Earth to Mars using Fano geometric encoding.

## Quick Start

```bash
# Open the demo player
firefox web/player.html

# Or serve it via the Fano Garden server
cd /home/main/devops/json-canvas-svg/c-server
cp -r ../interplanetary-demo/web public/
# Access at http://localhost:8080/interplanetary-demo/web/player.html
```

## Files

- `ndjson/interplanetary-demo.ndjson` - Complete 48-event trace (16KB)
- `yaml/interplanetary-demo.yaml` - Space-efficient outline
- `web/player.html` - Interactive demo player

## The Story

1. **Earth Station** (Mojave Desert): 241-bit Garden Array encodes Wikipedia "Fano plane"
2. **WordNet Processing**: Extracts 11 synsets, forms knowledge triple
3. **Fano Encoding**: Matrix [0,2,1,2,2,0,2], angle 164.3°, seed 9069010
4. **Laser Transmission**: 100W @ 532nm through 7-satellite constellation
5. **Transit**: 12.5 minutes through interplanetary space
6. **Mars Reception**: Mars Base Alpha decodes and renders
7. **Completion**: Document displayed in 61-bit Personal Dome

## Technical Details

- **Data Rate**: 100 Gbps
- **Distance**: 225,000,000 km
- **Duration**: 12.5 minutes
- **Encoding**: 24-bit seed (7×2 matrix + 10-bit angle)
- **Protocol**: Fano Constellation Relay

## Replay

```javascript
// Load and replay
curl -s http://localhost:4096/api/wikipedia/Fano_plane > fano.json
# Or replay the NDJSON directly in the player
```

## Credits

- Fano Garden Open Source Project
- WordNet 3.0 Princeton University
- MIT License
