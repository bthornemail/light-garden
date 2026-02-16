const FANO = {
  // Rational ratios (0-1 scale) for Fano points
  // These map to HSV hue angles
  RATIOS: [
    0,        // Point 1: Red (0/360 = 0)
    1/12,     // Point 2: Orange (30/360 = 1/12)
    1/6,      // Point 3: Yellow (60/360 = 1/6)
    1/3,      // Point 4: Green (120/360 = 1/3)
    2/3,      // Point 5: Blue (240/360 = 2/3)
    3/4,      // Point 6: Indigo (270/360 = 3/4)
    5/6,      // Point 7: Violet (300/360 = 5/6)
    0          // Point 8: White (S=0, any hue)
  ],
  
  NAMES: ['Metatron', 'Solomon', 'Solon', 'Asabiyyah', 'Enoch', 'Speaker', 'Genesis', 'Observer'],
  
  COLORS: ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet', 'White'],
  
  // Fano lines: [point indices]
  LINES: [
    [1, 2, 4], // Line 1
    [1, 3, 7], // Line 2
    [1, 5, 6], // Line 3
    [2, 3, 5], // Line 4
    [2, 6, 7], // Line 5
    [3, 4, 6], // Line 6
    [4, 5, 7]  // Line 7
  ],
  
  // Get hue angle from Fano point index (1-8)
  getHue(pointIndex) {
    if (pointIndex < 1 || pointIndex > 8) return 0;
    return this.RATIOS[pointIndex - 1] * 360;
  },
  
  // Get rational ratio string
  getRatio(pointIndex) {
    if (pointIndex < 1 || pointIndex > 8) return '0';
    const r = this.RATIOS[pointIndex - 1];
    if (r === 0) return '0';
    if (r === 1/12) return '1/12';
    if (r === 1/6) return '1/6';
    if (r === 1/3) return '1/3';
    if (r === 2/3) return '2/3';
    if (r === 3/4) return '3/4';
    if (r === 5/6) return '5/6';
    return r.toFixed(4);
  }
};

// HSV to RGB conversion
function hsvToRgb(h, s, v) {
  const hNorm = h / 360;
  const sNorm = s / 255;
  const vNorm = v / 255;
  
  let r = 0, g = 0, b = 0;
  const i = Math.floor(hNorm * 6);
  const f = hNorm * 6 - i;
  const p = vNorm * (1 - sNorm);
  const q = vNorm * (1 - f * sNorm);
  const t = vNorm * (1 - (1 - f) * sNorm);
  
  switch (i % 6) {
    case 0: r = vNorm; g = t; b = p; break;
    case 1: r = q; g = vNorm; b = p; break;
    case 2: r = p; g = vNorm; b = t; break;
    case 3: r = p; g = q; b = vNorm; break;
    case 4: r = t; g = p; b = vNorm; break;
    case 5: r = vNorm; g = p; b = q; break;
  }
  
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// RGB to HSV conversion
function rgbToHsv(r, g, b) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  
  let h = 0;
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  
  if (delta !== 0) {
    switch (max) {
      case rNorm: h = 60 * (((gNorm - bNorm) / delta) % 6); break;
      case gNorm: h = 60 * (((bNorm - rNorm) / delta) + 2); break;
      case bNorm: h = 60 * (((rNorm - gNorm) / delta) + 4); break;
    }
  }
  
  if (h < 0) h += 360;
  
  return { h: Math.round(h), s: Math.round(s * 255), v: Math.round(v * 255) };
}

const app = (() => {
  let svgDoc = null;
  let selectedPath = null;
  let selectedLed = null;
  let lightState = {};
  let ndjsonLog = [];
  let syncInterval = null;
  
  const elements = {
    svgObject: document.getElementById('fano-svg'),
    ledInfo: document.getElementById('led-info'),
    hueSlider: document.getElementById('hue'),
    satSlider: document.getElementById('sat'),
    valSlider: document.getElementById('val'),
    hueVal: document.getElementById('hue-val'),
    satVal: document.getElementById('sat-val'),
    valVal: document.getElementById('val-val'),
    log: document.getElementById('log'),
    tCenter: document.getElementById('t-center'),
    pCenter: document.getElementById('p-center'),
    gCenter: document.getElementById('g-center'),
    syncStatus: document.getElementById('sync-status'),
    mqttStatus: document.getElementById('mqtt-status'),
    peerCount: document.getElementById('peer-count')
  };
  
  function init() {
    elements.svgObject.addEventListener('load', handleSvgLoad);
    window.addEventListener('gardenElementClick', handleElementClick);
    
    elements.hueSlider.addEventListener('input', updateSliderLabels);
    elements.satSlider.addEventListener('input', updateSliderLabels);
    elements.valSlider.addEventListener('input', updateSliderLabels);
    
    document.getElementById('update-btn').addEventListener('click', sendUpdate);
    document.getElementById('sign-btn').addEventListener('click', signAndSend);
    document.getElementById('clear-log').addEventListener('click', clearLog);
    document.getElementById('download-log').addEventListener('click', downloadLog);
    document.getElementById('export-lights').addEventListener('click', () => exportData('lights'));
    document.getElementById('export-jsonl').addEventListener('click', () => exportData('jsonl'));
    document.getElementById('export-ndjson').addEventListener('click', () => exportData('ndjson'));
    
    document.getElementById('sweep-diag0').addEventListener('click', () => sweepDiagonal(0));
    document.getElementById('sweep-diag1').addEventListener('click', () => sweepDiagonal(1));
    document.getElementById('fano-line1').addEventListener('click', () => activateFanoLine(1));
    document.getElementById('fano-line2').addEventListener('click', () => activateFanoLine(2));
    document.getElementById('fano-line3').addEventListener('click', () => activateFanoLine(3));
    document.getElementById('fano-line4').addEventListener('click', () => activateFanoLine(4));
    document.getElementById('fano-line5').addEventListener('click', () => activateFanoLine(5));
    document.getElementById('fano-line6').addEventListener('click', () => activateFanoLine(6));
    document.getElementById('fano-line7').addEventListener('click', () => activateFanoLine(7));
    document.getElementById('pulse-center').addEventListener('click', pulseCenter);
    document.getElementById('rainbow-ring').addEventListener('click', rainbowRing);
    
    document.getElementById('connect-btn').addEventListener('click', connectNetwork);
    document.getElementById('sync-btn').addEventListener('click', requestSync);
    
    startSyncMonitor();
    
    if (typeof VIEWPORTS !== 'undefined') {
      VIEWPORTS.init();
    }
  }
  
  function connectNetwork() {
    if (typeof NETWORK !== 'undefined') {
      NETWORK.init();
      elements.mqttStatus.textContent = 'Connecting...';
      elements.mqttStatus.className = 'value connecting';
      addLog('Connecting to network...', 'network');
    }
  }
  
  function requestSync() {
    if (typeof NETWORK !== 'undefined') {
      NETWORK.requestSync();
      addLog('Sync requested', 'network');
    }
  }
  
  window.app = {
    onRemoteUpdate(path, state) {
      updateLedVisual(path, state.h, state.s, state.v);
      addLog(`Remote: ${path}`, 'mqtt');
      if (typeof VIEWPORTS !== 'undefined') {
        VIEWPORTS.update();
      }
    },
    
    onFullSync(state) {
      Object.keys(state).forEach(path => {
        const s = state[path];
        updateLedVisual(path, s.h, s.s, s.v);
      });
      addLog('Full sync received', 'network');
      if (typeof VIEWPORTS !== 'undefined') {
        VIEWPORTS.update();
      }
    },
    
    onControl(idx) {
      const patterns = [
        () => activateFanoLine(1),
        () => activateFanoLine(2),
        () => activateFanoLine(3),
        () => activateFanoLine(4),
        () => activateFanoLine(5),
        () => activateFanoLine(6),
        () => activateFanoLine(7),
        () => rainbowRing(),
        () => sweepDiagonal(0),
        () => sweepDiagonal(1),
        () => sweepDiagonal(2),
        () => sweepDiagonal(3),
        () => pulseCenter(),
        () => connectNetwork(),
        () => requestSync(),
        () => downloadLog()
      ];
      if (patterns[idx]) {
        patterns[idx]();
      }
    }
  };
  
  function handleSvgLoad() {
    svgDoc = elements.svgObject.contentDocument;
    addLog('SVG loaded', 'system');
    startPointerRotation();
  }
  
  function handleElementClick(e) {
    const { path, ring, fano, diag, id, timestamp } = e.detail;
    selectedPath = path;
    
    const logEntry = {
      event: 'click',
      path,
      ring,
      fano,
      diag,
      id,
      timestamp
    };
    
    ndjsonLog.push(logEntry);
    addLog(path, 'click');
    
    // Get Fano point info
    const fanoNum = parseInt(fano) || 0;
    const fanoName = fanoNum > 0 && fanoNum <= 8 ? FANO.NAMES[fanoNum - 1] : 'Unknown';
    const fanoColor = fanoNum > 0 && fanoNum <= 8 ? FANO.COLORS[fanoNum - 1] : 'Unknown';
    const fanoRatio = FANO.getRatio(fanoNum);
    const fanoHue = FANO.getHue(fanoNum);
    
    elements.ledInfo.innerHTML = `
      <div class="path">${path}</div>
      <div class="detail">
        <span class="fano-name">${fanoName}</span> | ${fanoColor}
      </div>
      <div class="detail">
        Ring: ${ring || '—'} | Diag: ${diag || '—'}
      </div>
      <div class="detail ratio">
        Ratio: <span class="ratio-val">${fanoRatio}</span> (${fanoHue}°)
      </div>
    `;
  }
  
  function updateSliderLabels() {
    elements.hueVal.textContent = elements.hueSlider.value;
    elements.satVal.textContent = elements.satSlider.value;
    elements.valVal.textContent = elements.valSlider.value;
  }
  
  function sendUpdate() {
    if (!selectedPath) {
      addLog('No LED selected', 'warn');
      return;
    }
    
    const hue = parseInt(elements.hueSlider.value);
    const sat = parseInt(elements.satSlider.value);
    const val = parseInt(elements.valSlider.value);
    
    const update = {
      event: 'update',
      path: selectedPath,
      h: hue,
      s: sat,
      v: val,
      timestamp: Date.now()
    };
    
    ndjsonLog.push(update);
    addLog(`${selectedPath} → H:${hue} S:${sat} V:${val}`, 'update');
    
    updateLedVisual(selectedPath, hue, sat, val);
    
    if (typeof NETWORK !== 'undefined') {
      NETWORK.publish(selectedPath, { h: hue, s: sat, v: val, t: update.timestamp });
    }
    
    if (typeof VIEWPORTS !== 'undefined') {
      VIEWPORTS.update();
    }
  }
  
  function signAndSend() {
    if (!selectedPath) {
      addLog('No LED selected', 'warn');
      return;
    }
    
    const sig = generateSignature(selectedPath);
    const entry = {
      event: 'signed',
      path: selectedPath,
      sig,
      timestamp: Date.now()
    };
    
    ndjsonLog.push(entry);
    addLog(`${selectedPath} signed: ${sig.slice(0, 12)}...`, 'signed');
    
    sendUpdate();
  }
  
  function generateSignature(path) {
    const timestamp = Date.now();
    const message = `${path}:${timestamp}`;
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return '0x' + Math.abs(hash).toString(16).padStart(8, '0');
  }
  
  function updateLedVisual(path, h, s, v) {
    if (!svgDoc) return;
    
    const led = svgDoc.querySelector(`[data-path="${path}"]`);
    if (led) {
      const fill = `hsl(${h}, ${s/2.55}%, ${v/2.55}%)`;
      led.setAttribute('fill', fill);
    }
  }
  
  function sweepDiagonal(diagIndex) {
    if (!svgDoc) return;
    
    addLog(`Sweeping diagonal ${diagIndex}`, 'pattern');
    
    const leds = svgDoc.querySelectorAll(`[data-diag="${diagIndex}"]`);
    let hue = 0;
    
    leds.forEach((led, i) => {
      setTimeout(() => {
        const fill = `hsl(${hue}, 100%, 60%)`;
        led.setAttribute('fill', fill);
        addLog(`${led.getAttribute('data-path')} → ${hue}°`, 'led');
        hue = (hue + 30) % 360;
      }, i * 100);
    });
  }
  
  function activateFanoLine(lineNum) {
    if (!svgDoc) return;
    
    // Fano line point indices (1-based)
    const linePoints = FANO.LINES[lineNum - 1];
    if (!linePoints) return;
    
    addLog(`Activating Fano Line ${lineNum}: Points ${linePoints.join('-')}`, 'pattern');
    
    // Map Fano points to ring 2 LED paths (m/240'/1'/n'/m')
    const pathMap = {
      1: "m/240'/1'/0'/1'",
      2: "m/240'/1'/1'/2'",
      3: "m/240'/1'/2'/3'",
      4: "m/240'/1'/3'/4'",
      5: "m/240'/1'/4'/5'",
      6: "m/240'/1'/5'/6'",
      7: "m/240'/1'/6'/7'",
      8: "m/240'/1'/7'/8'"
    };
    
    linePoints.forEach((pointIndex, i) => {
      const path = pathMap[pointIndex];
      const hue = FANO.getHue(pointIndex);
      const ratio = FANO.getRatio(pointIndex);
      const name = FANO.NAMES[pointIndex - 1];
      
      setTimeout(() => {
        const led = svgDoc.querySelector(`[data-path="${path}"]`);
        if (led) {
          // Use HSV ratio for color
          const fill = `hsl(${hue}, 100%, 60%)`;
          led.setAttribute('fill', fill);
          addLog(`${path} → ${name} (${ratio}, ${hue}°)`, 'led');
        }
      }, i * 400);
    });
  }
  
  function pulseCenter() {
    if (!svgDoc) return;
    
    addLog('Pulsing center', 'pattern');
    
    const center = svgDoc.getElementById('g-r1-0');
    if (!center) return;
    
    let brightness = 0;
    let direction = 1;
    
    const pulse = setInterval(() => {
      brightness += direction * 15;
      if (brightness >= 255) direction = -1;
      if (brightness <= 0) {
        clearInterval(pulse);
        brightness = 255;
      }
      center.setAttribute('fill', `hsl(0, 0%, ${brightness/2.55}%)`);
    }, 50);
  }
  
  function rainbowRing() {
    if (!svgDoc) return;
    
    addLog('Rainbow ring', 'pattern');
    
    const ring2 = svgDoc.querySelectorAll('#ring2 .led');
    let hue = 0;
    
    ring2.forEach((led, i) => {
      setTimeout(() => {
        led.setAttribute('fill', `hsl(${hue}, 100%, 60%)`);
        hue = (hue + 45) % 360;
      }, i * 100);
    });
  }
  
  function startPointerRotation() {
    const pointer = svgDoc.getElementById('pointer-arrow');
    if (!pointer) return;
    
    let angle = 0;
    setInterval(() => {
      angle = (angle + 51.4) % 360;
      pointer.setAttribute('transform', `rotate(${angle})`);
    }, 3000);
  }
  
  function startSyncMonitor() {
    syncInterval = setInterval(() => {
      const tHue = Math.random() * 360;
      const pHue = Math.random() * 360;
      const gHue = Math.random() * 360;
      
      elements.tCenter.textContent = `H:${Math.round(tHue)}°`;
      elements.pCenter.textContent = `H:${Math.round(pHue)}°`;
      elements.gCenter.textContent = `H:${Math.round(gHue)}°`;
      
      const tolerance = 15;
      const synced = Math.abs(tHue - pHue) < tolerance && 
                     Math.abs(pHue - gHue) < tolerance;
      
      if (synced) {
        elements.syncStatus.textContent = '✅ SYNCED';
        elements.syncStatus.classList.add('synced');
        addLog('✨ Garden synced', 'sync');
      } else {
        elements.syncStatus.textContent = '⚠️ Not synced';
        elements.syncStatus.classList.remove('synced');
      }
    }, 3000);
  }
  
  function addLog(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    const time = new Date().toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    
    entry.innerHTML = `
      <span class="time">${time}</span>
      <span class="type">[${type}]</span>
      <span class="path">${message}</span>
    `;
    
    elements.log.appendChild(entry);
    elements.log.parentElement.scrollTop = elements.log.parentElement.scrollHeight;
  }
  
  function clearLog() {
    elements.log.innerHTML = '';
    ndjsonLog = [];
  }
  
  function downloadLog() {
    if (ndjsonLog.length === 0) {
      addLog('No log entries', 'warn');
      return;
    }
    
    const content = ndjsonLog.map(e => JSON.stringify(e)).join('\n');
    const blob = new Blob([content], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `garden-log-${Date.now()}.ndjson`;
    a.click();
    
    URL.revokeObjectURL(url);
    addLog(`Downloaded ${ndjsonLog.length} entries`, 'system');
  }
  
  function exportData(type) {
    if (type === 'ndjson') {
      downloadLog();
      return;
    }
    
    fetch(type === 'lights' ? 'lights.json' : 'lights.jsonl')
      .then(r => r.text())
      .then(content => {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = type === 'lights' ? 'lights.json' : 'lights.jsonl';
        a.click();
        
        URL.revokeObjectURL(url);
        addLog(`Exported ${type}`, 'system');
      });
  }
  
  document.addEventListener('DOMContentLoaded', init);
  
  return {};
})();
