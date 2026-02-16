#!/usr/bin/env python3
"""
render-fractal.py - Render wisdom-fractal.ndjson to video frames
Creates GIF and MP4 from the 120-event NDJSON
"""

import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import os
from tqdm import tqdm

# Configuration
NDJSON_PATH = "./ndjson/wisdom-fractal.ndjson"
OUTPUT_DIR = "./render/frames"
WIDTH, HEIGHT = 1920, 1080
FPS = 10

# Colors
COLORS = {
    "background": (10, 10, 26),
    "text": (0, 255, 0),
    "accent": (143, 0, 255),
    "q0": (255, 0, 0),  # Red - KK
    "q1": (0, 255, 0),  # Green - KU
    "q2": (0, 136, 255),  # Blue - UK
    "q3": (136, 0, 255),  # Purple - UU
}


def load_events():
    """Load NDJSON events"""
    events = []
    with open(NDJSON_PATH, "r") as f:
        for line in f:
            if line.strip():
                events.append(json.loads(line))
    return events


def draw_matrix(draw, matrix, cx, cy, size=80):
    """Draw the 7-point Fano matrix"""
    if not matrix:
        return

    # Draw 7 cells in a row
    cell_width = size
    start_x = cx - (7 * cell_width) // 2

    for i, q in enumerate(matrix):
        x = start_x + i * cell_width
        y = cy

        color_key = f"q{q}"
        color = COLORS.get(color_key, COLORS["q0"])

        # Draw cell
        draw.rectangle(
            [x, y, x + cell_width - 2, y + size], fill=color, outline=COLORS["text"]
        )

        # Draw quadrant label
        draw.text((x + 10, y + 30), str(q), fill=(0, 0, 0))


def draw_angle_indicator(draw, angle, cx, cy, radius=100):
    """Draw angle indicator"""
    # Draw circle
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        outline=COLORS["text"],
        width=3,
    )

    # Draw angle line
    rad = np.radians(angle - 90)  # -90 to start from top
    x = cx + radius * np.cos(rad)
    y = cy + radius * np.sin(rad)

    draw.line([(cx, cy), (x, y)], fill=COLORS["text"], width=3)

    # Draw angle text
    draw.text((cx - 20, cy - 10), f"{angle:.1f}°", fill=COLORS["text"])


def draw_fano_points(draw, cx, cy, radius=150):
    """Draw 7 Fano points in a circle"""
    for i in range(7):
        angle = i * 2 * np.pi / 7 - np.pi / 2
        x = cx + radius * np.cos(angle)
        y = cy + radius * np.sin(angle)

        point_colors = [
            (255, 0, 0),  # Metatron - Red
            (255, 136, 0),  # Solomon - Orange
            (255, 255, 0),  # Solon - Yellow
            (0, 255, 0),  # Asabiyyah - Green
            (0, 0, 255),  # Enoch - Blue
            (75, 0, 130),  # Speaker - Indigo
            (128, 0, 128),  # Genesis - Violet
        ]

        r = 15
        draw.ellipse(
            [x - r, y - r, x + r, y + r], fill=point_colors[i], outline=COLORS["text"]
        )


def render_frame(event, frame_num):
    """Render a single frame"""
    img = Image.new("RGB", (WIDTH, HEIGHT), COLORS["background"])
    draw = ImageDraw.Draw(img)

    try:
        font_large = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32
        )
        font_medium = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24
        )
        font_small = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16
        )
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # Title
    draw.text(
        (WIDTH // 2 - 300, 30),
        "🌌 WISDOM FRACTAL",
        fill=COLORS["text"],
        font=font_large,
    )

    # Event type
    event_type = event.get("event", "unknown")
    draw.text(
        (50, 100), f"Event: {event_type}", fill=COLORS["accent"], font=font_medium
    )

    # Character quote if present
    if "quote" in event:
        quote = event["quote"]
        character = event.get("character", "Unknown")
        draw.text((50, 150), f"{character}:", fill=COLORS["text"], font=font_medium)

        # Wrap quote text
        words = quote.split()
        lines = []
        line = []
        for word in words:
            line.append(word)
            if len(" ".join(line)) > 80:
                lines.append(" ".join(line[:-1]))
                line = [line[-1]]
        if line:
            lines.append(" ".join(line))

        y = 190
        for line in lines[:5]:  # Max 5 lines
            draw.text((70, y), line, fill=COLORS["text"], font=font_small)
            y += 25

    # Word if present
    if "word" in event:
        draw.text(
            (50, 350), f"Word: {event['word']}", fill=COLORS["accent"], font=font_large
        )

    # Matrix
    if "matrix" in event:
        matrix = event["matrix"]
        draw.text((50, 420), "Matrix:", fill=COLORS["text"], font=font_medium)
        draw_matrix(draw, matrix, 400, 420, size=60)

    # Angle
    if "angle" in event:
        angle = event["angle"]
        draw.text((50, 520), "Angle:", fill=COLORS["text"], font=font_medium)
        draw_angle_indicator(draw, angle, 200, 560)

    # Fano point visualization (right side)
    draw_fano_points(draw, WIDTH - 300, HEIGHT // 2)

    # Event counter
    draw.text(
        (WIDTH - 200, HEIGHT - 50),
        f"Frame: {frame_num}",
        fill=COLORS["text"],
        font=font_small,
    )

    return img


def main():
    """Main render function"""
    print("Loading events...")
    events = load_events()
    print(f"Loaded {len(events)} events")

    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Render frames
    print("Rendering frames...")
    for i, event in enumerate(tqdm(events)):
        img = render_frame(event, i)

        # Save frame
        frame_path = os.path.join(OUTPUT_DIR, f"frame_{i:05d}.png")
        img.save(frame_path)

    print(f"\nRendered {len(events)} frames to {OUTPUT_DIR}")
    print("\nTo create GIF:")
    print(
        f"  ffmpeg -r 10 -i {OUTPUT_DIR}/frame_%05d.png -vf 'fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer' -loop 0 ./render/wisdom-fractal.gif"
    )
    print("\nTo create MP4:")
    print(
        f"  ffmpeg -r 10 -i {OUTPUT_DIR}/frame_%05d.png -c:v libx264 -pix_fmt yuv420p -crf 23 ./render/wisdom-fractal.mp4"
    )


if __name__ == "__main__":
    main()
