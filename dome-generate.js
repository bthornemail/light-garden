const fs = require('fs');

const LEDS = [];
const POLES = 6;
const BANDS = 5;
const HEIGHTS = [0, 14.8, 29.6, 48.1, 74];
const RADIUS = 37;

const FANO_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];
const FANO_HUES = [0, 30, 60, 120, 240, 270, 300];
const FANO_NAMES = ['Metatron', 'Solomon', 'Solon', 'Asabiyyah', 'Enoch', 'Speaker', 'Genesis'];

const poleAngles = [0, 60, 120, 180, 240, 300].map(a => a * Math.PI / 180);
const polePositions = poleAngles.map(angle => ({
  x: RADIUS * Math.cos(angle),
  z: RADIUS * Math.sin(angle)
}));

let ledIndex = 0;

polePositions.forEach((pos, poleIdx) => {
  const poleName = FANO_NAMES[poleIdx];
  
  HEIGHTS.forEach((height, bandIdx) => {
    const fano = ((poleIdx + bandIdx) % 7);
    const fanoName = FANO_NAMES[fano];
    const color = FANO_COLORS[fano];
    const hue = FANO_HUES[fano];
    
    LEDS.push({
      id: `pole${poleIdx+1}-band${bandIdx+1}`,
      path: `m/240'/${poleIdx+1}'/${bandIdx+1}'/${fano+1}'`,
      x: Math.round(pos.x * 10) / 10,
      y: height,
      z: Math.round(pos.z * 10) / 10,
      pole: poleIdx + 1,
      pole_name: poleName,
      band: bandIdx + 1,
      fano: fano + 1,
      fano_name: fanoName,
      color: color,
      h: hue,
      s: 255,
      v: 255
    });
    ledIndex++;
  });
});

LEDS.push({
  id: 'genesis-gate',
  path: "m/240'/0'/0'/8'",
  x: 0,
  y: 0,
  z: 0,
  pole: 0,
  band: 0,
  fano: 8,
  fano_name: 'Observer',
  color: 'violet',
  h: 300,
  s: 255,
  v: 255
});
ledIndex++;

LEDS.push({
  id: 'observer',
  path: "m/240'/0'/1'/8'",
  x: 0,
  y: 100,
  z: 0,
  pole: 0,
  band: 6,
  fano: 8,
  fano_name: 'Observer',
  color: 'white',
  h: 0,
  s: 0,
  v: 255
});
ledIndex++;

const DOME_LEDS = 241 - ledIndex;
for (let i = 0; i < DOME_LEDS; i++) {
  const phi = Math.acos(1 - 2 * (i + 0.5) / DOME_LEDS);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  
  const radius = 37;
  const y = 74 + radius * Math.cos(phi);
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  
  const fano = (i % 7);
  const fanoName = FANO_NAMES[fano];
  const color = FANO_COLORS[fano];
  const hue = FANO_HUES[fano];
  
  LEDS.push({
    id: `dome-${i}`,
    path: `m/240'/dome/${i}'/${fano+1}'`,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    z: Math.round(z * 10) / 10,
    ring: 'dome',
    index: i,
    fano: fano + 1,
    fano_name: fanoName,
    color: color,
    h: hue,
    s: 255,
    v: 255
  });
}

const ndjson = LEDS.map(led => JSON.stringify(led)).join('\n');
fs.writeFileSync('dome-leds.ndjson', ndjson);
fs.writeFileSync('dome-leds.json', JSON.stringify(LEDS, null, 2));

console.log(`Generated ${LEDS.length} LEDs for dome`);
console.log(`- ${POLES} poles × ${BANDS} bands = ${POLES * BANDS} cylinder LEDs`);
console.log(`- 2 center LEDs (floor + ceiling)`);
console.log(`- ${DOME_LEDS} geodesic dome LEDs`);
