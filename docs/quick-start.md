---
layout: default
title: Quick Start - Run Light Garden in 5 Minutes
---

# 🚀 Quick Start: Light Garden in 5 Minutes

## **1. Clone the Repository**

```bash
git clone https://github.com/bthornemail/light-garden.git
cd light-garden
```

---

## **2. Start the Python Server**

```bash
python3 serve.py
# Server running at http://localhost:8000
```

---

## **3. Open the Web App**

Open your browser to [http://localhost:8000](http://localhost:8000)

You'll see:
- The Fano plane diagram with 7 colored points
- 7-bit, 61-bit, and 241-bit LED arrays
- Control panel with sliders and buttons

---

## **4. Click an LED**

Click any colored circle in the SVG. You'll see:
- Its HD wallet path (e.g., `m/240'/1'/0'/1'`)
- Its Fano point (1-8)
- Its rational ratio (0, 1/12, etc.)
- Its hue angle (0-360°)

---

## **5. Adjust the Color**

Use the Hue/Saturation/Value sliders to change the LED's color. Click "Update" to see the change.

---

## **6. Run a Pattern**

Click "Sweep Diag 0" or "Fano Line 1" to see the LEDs animate through geometric patterns.

---

## **7. Load the Wisdom Fractal**

```bash
# In another terminal
curl -O https://raw.githubusercontent.com/bthornemail/light-garden/main/docs/assets/demos/wisdom-fractal.ndjson
```

Then click "Load Canon" in the web app and select the file.

---

## **8. Watch the Light Show**

The epistemic square will animate through 77 frames, showing how the word "wisdom" expands into a 347-node knowledge cloud.

---

## **Next Steps**

- [Build a physical hexagonal dome](/guides/build-dome)
- [Flash an ESP32 node](/guides/esp32-firmware)
- [Create your own document adapter](/guides/create-adapter)
- [Read the full philosophy](/philosophy)
