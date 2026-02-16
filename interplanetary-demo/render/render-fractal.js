#!/usr/bin/env node
// render-fractal.js - Render wisdom-fractal.ndjson to video frames

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const NDJSON_PATH = './ndjson/wisdom-fractal.ndjson';
const OUTPUT_DIR = './render/frames';
const FRAME_RATE = 10; // 10 fps
const EVENTS_PER_SECOND = 5; // 5 events per second

async function renderFractal() {
    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Load events
    const ndjson = fs.readFileSync(NDJSON_PATH, 'utf-8');
    const events = ndjson.split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

    console.log(`Loaded ${events.length} events`);

    // Launch browser
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Load the player page
    await page.goto('http://localhost:8080/interplanetary', {
        waitUntil: 'networkidle0'
    });

    // Wait for canvas to be ready
    await page.waitForSelector('#center-canvas');

    let frameCount = 0;
    
    // Process events
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        
        // Send event data to page
        await page.evaluate((eventData) => {
            // Update matrix if present
            if (eventData.matrix && window.square) {
                window.square.setMatrix(eventData.matrix);
            }
            
            // Update angle if present
            if (eventData.angle && window.square) {
                window.square.setAngle(eventData.angle);
            }
            
            // Update status text
            const statusEl = document.getElementById('status-text');
            if (statusEl) {
                statusEl.textContent = `${eventData.event}: ${eventData.character || eventData.word || eventData.view || ''}`;
            }
        }, event);

        // Wait a moment for rendering
        await page.waitForTimeout(100);

        // Take screenshot
        const screenshotPath = path.join(OUTPUT_DIR, `frame_${String(frameCount).padStart(5, '0')}.png`);
        await page.screenshot({ 
            path: screenshotPath,
            fullPage: false
        });

        console.log(`Frame ${frameCount}: ${event.event}`);
        frameCount++;

        // Duplicate frames for events that should last longer
        if (event.event === 'character_appears' || event.event === 'quote') {
            // Hold this frame for 3 more frames
            for (let j = 0; j < 3; j++) {
                const duplicatePath = path.join(OUTPUT_DIR, `frame_${String(frameCount).padStart(5, '0')}.png`);
                fs.copyFileSync(screenshotPath, duplicatePath);
                frameCount++;
            }
        }
    }

    await browser.close();

    console.log(`\nRendered ${frameCount} frames to ${OUTPUT_DIR}`);
    console.log('Now run:');
    console.log('  ffmpeg -r 10 -i ./render/frames/frame_%05d.png -vf "fps=30,scale=1920:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" -loop 0 ./render/wisdom-fractal.gif');
    console.log('  ffmpeg -r 10 -i ./render/frames/frame_%05d.png -c:v libx264 -pix_fmt yuv420p -crf 23 ./render/wisdom-fractal.mp4');
}

renderFractal().catch(console.error);
