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
  let domeSvgDoc = null;
  let dome3DViewer = null;
  let epistemicSquare = null;
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
    peerCount: document.getElementById('peer-count'),
    mediaFile: document.getElementById('media-file'),
    mediaStatus: document.getElementById('media-status'),
    mediaFilename: document.getElementById('media-filename'),
    mediaChunks: document.getElementById('media-chunks'),
    mediaProgress: document.getElementById('media-progress')
  };
  
  let mediaCodec = null;
  let selectedFile = null;
  
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
    
    document.getElementById('media-file').addEventListener('change', handleMediaFileSelect);
    document.getElementById('media-encode').addEventListener('click', encodeMediaFile);
    document.getElementById('media-transmit').addEventListener('click', transmitMedia);
    document.getElementById('media-receive').addEventListener('click', startMediaReceive);
    document.getElementById('media-stop').addEventListener('click', stopMedia);
    document.getElementById('media-save').addEventListener('click', saveMediaNDJSON);
    document.getElementById('media-clear').addEventListener('click', clearMedia);
    
    document.getElementById('auth-authenticate').addEventListener('click', authAuthenticate);
    document.getElementById('auth-refresh').addEventListener('click', authRefreshPeers);
    document.getElementById('admin-change-role').addEventListener('click', adminChangeRole);
    
    document.getElementById('canon-load')?.addEventListener('click', initAndLoadCanon);
    document.getElementById('canon-play')?.addEventListener('click', playCanon);
    document.getElementById('canon-pause')?.addEventListener('click', pauseCanon);
    document.getElementById('canon-stop')?.addEventListener('click', stopCanon);
    document.getElementById('canon-record')?.addEventListener('click', toggleRecording);
    document.getElementById('canon-scrubber')?.addEventListener('input', scrubCanon);
    document.getElementById('canon-speed')?.addEventListener('input', speedCanon);
    document.getElementById('canon-series-select')?.addEventListener('change', selectCanonSeries);
    
    document.getElementById('dome-pole1')?.addEventListener('click', () => highlightDomePole(1));
    document.getElementById('dome-pole2')?.addEventListener('click', () => highlightDomePole(2));
    document.getElementById('dome-pole3')?.addEventListener('click', () => highlightDomePole(3));
    document.getElementById('dome-pole4')?.addEventListener('click', () => highlightDomePole(4));
    document.getElementById('dome-pole5')?.addEventListener('click', () => highlightDomePole(5));
    document.getElementById('dome-pole6')?.addEventListener('click', () => highlightDomePole(6));
    document.getElementById('dome-band1')?.addEventListener('click', () => highlightDomeBand(1));
    document.getElementById('dome-band2')?.addEventListener('click', () => highlightDomeBand(2));
    document.getElementById('dome-rotate-toggle')?.addEventListener('click', toggleDomeRotation);
    
    initEpistemicSquare();
    
    initAuthClient();
    
    setupViewTabs();
    
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
  
  function setupViewTabs() {
    const tabs = document.querySelectorAll('.view-tab');
    const containers = {
      '2d': document.getElementById('svg-container-2d'),
      'dome': document.getElementById('svg-container-dome'),
      '3d': document.getElementById('svg-container-3d')
    };
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        Object.entries(containers).forEach(([key, el]) => {
          if (key === view) {
            el.classList.remove('hidden');
          } else {
            el.classList.add('hidden');
          }
        });
        
        if (view === '3d' && !dome3DViewer) {
          init3DViewer();
        }
        
        addLog(`Switched to ${view} view`, 'system');
      });
    });
    
    document.getElementById('dome-svg').addEventListener('load', () => {
      domeSvgDoc = document.getElementById('dome-svg').contentDocument;
    });
  }
  
  function init3DViewer() {
    if (dome3DViewer) return;
    
    const script = document.createElement('script');
    script.src = 'dome-viewer.js';
    script.onload = () => {
      dome3DViewer = new Dome3DViewer('dome-3d-viewer', {
        width: 450,
        height: 450,
        autoRotate: true,
        rotationSpeed: 0.003
      });
      
      window.addEventListener('dome3DClick', (e) => {
        const { led, path } = e.detail;
        addLog(`3D: ${path} (${led.color})`, 'click');
        
        elements.ledInfo.innerHTML = `
          <div class="path">${path}</div>
          <div class="detail">
            <span class="fano-name">${led.fano_name || 'Unknown'}</span> | ${led.color}
          </div>
          <div class="detail">
            Pole: ${led.pole || '—'} | Band: ${led.band || '—'}
          </div>
          <div class="detail ratio">
            3D: (${led.x}, ${led.y}, ${led.z})
          </div>
        `;
      });
      
      addLog('3D viewer initialized', 'system');
    };
    document.head.appendChild(script);
  }
  
  function highlightDomePole(poleNum) {
    if (dome3DViewer) {
      dome3DViewer.highlightPole(poleNum);
      addLog(`Highlighting pole ${poleNum}`, 'pattern');
    }
  }
  
  function highlightDomeBand(bandNum) {
    if (dome3DViewer) {
      dome3DViewer.highlightBand(bandNum);
      addLog(`Highlighting band ${bandNum}`, 'pattern');
    }
  }
  
  function toggleDomeRotation() {
    if (dome3DViewer) {
      dome3DViewer.autoRotate = !dome3DViewer.autoRotate;
      addLog(`Auto-rotate: ${dome3DViewer.autoRotate ? 'ON' : 'OFF'}`, 'pattern');
    }
  }
  
  function initEpistemicSquare() {
    epistemicSquare = new EpistemicSquare({
      spinSpeed: 0.3,
      autoRotate: true
    });
    
    document.getElementById('epi-q1')?.addEventListener('click', () => askEpistemicQuestion(1));
    document.getElementById('epi-q2')?.addEventListener('click', () => askEpistemicQuestion(2));
    document.getElementById('epi-q3')?.addEventListener('click', () => askEpistemicQuestion(3));
    document.getElementById('epi-q4')?.addEventListener('click', () => askEpistemicQuestion(4));
    document.getElementById('epi-toggle')?.addEventListener('click', toggleEpistemicRotation);
    document.getElementById('epi-speed-up')?.addEventListener('click', () => adjustEpistemicSpeed(1.5));
    document.getElementById('epi-slow-down')?.addEventListener('click', () => adjustEpistemicSpeed(0.67));
    
    window.addEventListener('epistemicPointClick', handleEpistemicPointClick);
    
    updateEpistemicDisplay();
  }
  
  function askEpistemicQuestion(qNum) {
    if (!epistemicSquare) return;
    
    const q = epistemicSquare.askQuestion(qNum);
    if (!q) return;
    
    addLog(`Q${qNum}: ${q.question}`, 'epistemic');
    addLog(`Points in ${q.name}: ${q.points.join(', ')}`, 'epistemic');
    
    elements.ledInfo.innerHTML = `
      <div class="path">Q${qNum}: ${q.name}</div>
      <div class="detail">${q.question}</div>
      <div class="detail">${q.description}</div>
      <div class="detail ratio">Points: ${q.points.join(', ') || 'none'}</div>
    `;
  }
  
  function handleEpistemicPointClick(e) {
    const { id, name, hue, quadrant, angle } = e.detail;
    addLog(`Point ${id} (${name}) in ${quadrant}`, 'epistemic');
    
    elements.ledInfo.innerHTML = `
      <div class="path">Point ${id}: ${name}</div>
      <div class="detail">Hue: ${hue}°</div>
      <div class="detail ratio">Quadrant: ${quadrant}</div>
      <div class="detail">Angle: ${angle.toFixed(1)}°</div>
    `;
  }
  
  function toggleEpistemicRotation() {
    if (epistemicSquare) {
      epistemicSquare.setAutoRotate(!epistemicSquare.autoRotate);
      addLog(`Epistemic rotation: ${epistemicSquare.autoRotate ? 'ON' : 'OFF'}`, 'epistemic');
      
      const btn = document.getElementById('epi-toggle');
      if (btn) btn.textContent = epistemicSquare.autoRotate ? 'Pause' : 'Resume';
    }
  }
  
  function adjustEpistemicSpeed(multiplier) {
    if (epistemicSquare) {
      epistemicSquare.setSpeed(epistemicSquare.spinSpeed * multiplier);
      addLog(`Epistemic speed: ${epistemicSquare.spinSpeed.toFixed(2)}`, 'epistemic');
    }
  }
  
  function updateEpistemicDisplay() {
    if (!epistemicSquare) {
      requestAnimationFrame(updateEpistemicDisplay);
      return;
    }
    
    const state = epistemicSquare.getMnemonic();
    
    const seedEl = document.getElementById('epi-seed');
    const angleEl = document.getElementById('epi-angle');
    
    if (seedEl) seedEl.textContent = state.hex;
    if (angleEl) angleEl.textContent = `${state.angle.toFixed(1)}°`;
    
    requestAnimationFrame(updateEpistemicDisplay);
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
  
  window.addLog = addLog;
  
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
  
  function handleMediaFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    selectedFile = file;
    elements.mediaFilename.textContent = file.name;
    elements.mediaStatus.textContent = 'File selected';
    addLog(`Selected: ${file.name} (${file.size} bytes)`, 'media');
  }
  
  async function encodeMediaFile() {
    if (!selectedFile) {
      addLog('No file selected', 'warn');
      return;
    }
    
    elements.mediaStatus.textContent = 'Encoding...';
    addLog(`Encoding ${selectedFile.name}...`, 'media');
    
    if (!mediaCodec && epistemicSquare) {
      mediaCodec = new EpistemicCodec(epistemicSquare);
    }
    
    if (!mediaCodec) {
      addLog('EpistemicSquare not initialized', 'error');
      return;
    }
    
    try {
      const chunkCount = await mediaCodec.encodeFile(selectedFile);
      elements.mediaChunks.textContent = chunkCount;
      elements.mediaProgress.textContent = '0%';
      elements.mediaStatus.textContent = 'Ready to transmit';
      addLog(`Encoded into ${chunkCount} chunks`, 'media');
    } catch (err) {
      elements.mediaStatus.textContent = 'Encode failed';
      addLog(`Encode error: ${err.message}`, 'error');
    }
  }
  
  function transmitMedia() {
    if (!mediaCodec || mediaCodec.chunks.length === 0) {
      addLog('No encoded data', 'warn');
      return;
    }
    
    elements.mediaStatus.textContent = 'Transmitting...';
    addLog('Starting transmission...', 'media');
    
    mediaCodec.onProgress = (progress) => {
      elements.mediaProgress.textContent = `${progress}%`;
    };
    
    mediaCodec.onComplete = () => {
      elements.mediaStatus.textContent = 'Transmission complete';
      addLog('Transmission complete', 'media');
    };
    
    mediaCodec.transmit(80);
  }
  
  function startMediaReceive() {
    if (!mediaCodec && epistemicSquare) {
      mediaCodec = new EpistemicCodec(epistemicSquare);
    }
    
    if (!mediaCodec) {
      addLog('EpistemicSquare not initialized', 'error');
      return;
    }
    
    elements.mediaStatus.textContent = 'Receiving...';
    addLog('Waiting for transmission...', 'media');
    
    mediaCodec.startReceiving();
    
    window.addEventListener('epistemicReceive', (e) => {
      const { received, total } = e.detail;
      elements.mediaChunks.textContent = received;
      elements.mediaProgress.textContent = total > 0 ? `${Math.round((received/total)*100)}%` : '0%';
    }, { once: true });
    
    window.addEventListener('epistemicFileReceived', handleMediaFileReceived, { once: true });
  }
  
  function handleMediaFileReceived(e) {
    const { blob, url, type, size } = e.detail;
    
    elements.mediaStatus.textContent = `Received ${type}`;
    addLog(`File received: ${type}, ${size} bytes`, 'media');
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `received_${Date.now()}.${type === 'image' ? 'jpg' : type === 'text' ? 'txt' : 'bin'}`;
    a.click();
    
    URL.revokeObjectURL(url);
  }
  
  function stopMedia() {
    if (mediaCodec) {
      mediaCodec.playing = false;
      mediaCodec.receiving = false;
      elements.mediaStatus.textContent = 'Stopped';
      addLog('Media stopped', 'media');
    }
  }
  
  function saveMediaNDJSON() {
    if (!mediaCodec || mediaCodec.chunks.length === 0) {
      addLog('No encoded data to save', 'warn');
      return;
    }
    
    mediaCodec.saveAsNDJSON();
    addLog('Saved NDJSON', 'media');
  }
  
  function clearMedia() {
    if (mediaCodec) {
      mediaCodec.clear();
    }
    selectedFile = null;
    elements.mediaFilename.textContent = '—';
    elements.mediaChunks.textContent = '0';
    elements.mediaProgress.textContent = '0%';
    elements.mediaStatus.textContent = 'Ready';
    addLog('Media cleared', 'media');
  }
  
  let authClient = null;
  
  function initAuthClient() {
    if (typeof AuthClient !== 'undefined') {
      authClient = new AuthClient();
      
      setTimeout(() => {
        if (authClient) {
          document.getElementById('auth-peerid').textContent = authClient.peerId.slice(0, 16) + '...';
          document.getElementById('auth-status').textContent = authClient.authenticated ? 'Authenticated' : 'Pending';
          document.getElementById('auth-status').className = authClient.authenticated ? 'value online' : 'value offline';
          document.getElementById('auth-role').textContent = authClient.role;
          document.getElementById('auth-role').className = 'value role-' + authClient.role.toLowerCase();
          
          authClient.onAuthChange = (authenticated, role) => {
            document.getElementById('auth-status').textContent = authenticated ? 'Authenticated' : 'Not authenticated';
            document.getElementById('auth-status').className = authenticated ? 'value online' : 'value offline';
            document.getElementById('auth-role').textContent = role;
            document.getElementById('auth-role').className = 'value role-' + role.toLowerCase();
            
            if (role === 'ADMIN') {
              document.getElementById('admin-controls').classList.remove('hidden');
            } else {
              document.getElementById('admin-controls').classList.add('hidden');
            }
          };
          
          authClient.onPeerListUpdate = (peers) => {
            updatePeerList(peers);
          };
          
          authRefreshPeers();
          
          addLog('Auth client initialized', 'auth');
        }
      }, 1500);
    } else {
      document.getElementById('auth-status').textContent = 'Not available';
      document.getElementById('auth-status').className = 'value offline';
    }
  }
  
  function updatePeerList(peers) {
    const container = document.getElementById('peer-list-container');
    const adminSelect = document.getElementById('admin-target');
    
    if (!peers || peers.length === 0) {
      container.innerHTML = '<p class="hint">No peers connected</p>';
      adminSelect.innerHTML = '<option value="">Select peer</option>';
      return;
    }
    
    let html = '';
    adminSelect.innerHTML = '<option value="">Select peer</option>';
    
    peers.forEach(peer => {
      if (peer.id !== authClient?.peerId) {
        html += `
          <div class="peer-item">
            <span class="peer-id">${peer.id.slice(0, 12)}...</span>
            <span class="peer-role ${peer.role.toLowerCase()}">${peer.role}</span>
          </div>
        `;
        adminSelect.innerHTML += `<option value="${peer.id}">${peer.id.slice(0, 12)}... (${peer.role})</option>`;
      }
    });
    
    container.innerHTML = html || '<p class="hint">No other peers</p>';
  }
  
  async function authAuthenticate() {
    if (!authClient) {
      addLog('Auth client not initialized', 'error');
      return;
    }
    
    const authenticated = await authClient.authenticate();
    if (authenticated) {
      addLog('Authentication successful', 'auth');
    } else {
      addLog('Authentication failed', 'error');
    }
  }
  
  async function authRefreshPeers() {
    if (!authClient) {
      addLog('Auth client not initialized', 'error');
      return;
    }
    
    const peers = await authClient.getPeers();
    updatePeerList(peers);
    addLog(`Peer list refreshed (${peers.length} peers)`, 'auth');
  }
  
  async function adminChangeRole() {
    if (!authClient) {
      addLog('Auth client not initialized', 'error');
      return;
    }
    
    if (authClient.role !== 'ADMIN') {
      addLog('Only admins can change roles', 'warn');
      return;
    }
    
    const target = document.getElementById('admin-target').value;
    const newRole = document.getElementById('admin-new-role').value;
    
    if (!target || !newRole) {
      addLog('Select peer and role', 'warn');
      return;
    }
    
    const result = await authClient.changePeerRole(target, newRole);
    if (result.success) {
      addLog(`Changed role for ${target.slice(0, 8)}... to ${newRole}`, 'auth');
      authRefreshPeers();
    } else {
      addLog(`Failed: ${result.error}`, 'error');
    }
  }
  
  let canonManifest = null;
  let canonChunks = [];
  let canonPlaying = false;
  let canonTimeout = null;
  let currentCanonIndex = 0;
  
  async function loadCanonManifest() {
    addLog('Loading canon manifest...', 'canon');
    try {
      const response = await fetch('canon-manifest.ndjson');
      const text = await response.text();
      const lines = text.split('\n').filter(l => l.trim());
      canonManifest = lines.map(l => JSON.parse(l));
      
      const series = canonManifest.filter(e => e.event === 'series');
      addLog(`Loaded ${series.length} series`, 'canon');
      
      if (elements.mediaStatus) {
        elements.mediaStatus.textContent = `${series.length} series ready`;
      }
    } catch (err) {
      addLog(`Failed to load manifest: ${err.message}`, 'error');
    }
  }
  
  async function playCanon(seriesName = null) {
    if (!canonManifest) {
      await loadCanonManifest();
    }
    
    if (canonPlaying) {
      stopCanon();
      return;
    }
    
    canonPlaying = true;
    currentCanonIndex = 0;
    addLog('Playing canon...', 'canon');
    
    const seriesList = canonManifest.filter(e => e.event === 'series');
    const targetSeries = seriesName || seriesList[0]?.name;
    
    if (!targetSeries) {
      addLog('No series found', 'error');
      return;
    }
    
    const seriesInfo = seriesList.find(s => s.name === targetSeries);
    if (!seriesInfo) {
      addLog(`Series "${targetSeries}" not found`, 'error');
      return;
    }
    
    addLog(`Loading series: ${targetSeries}`, 'canon');
    
    try {
      const response = await fetch(seriesInfo.path);
      const text = await response.text();
      canonChunks = text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
      
      addLog(`Loaded ${canonChunks.length} chunks`, 'canon');
      playNextCanonChunk();
    } catch (err) {
      addLog(`Failed to load series: ${err.message}`, 'error');
      canonPlaying = false;
    }
  }
  
  function playNextCanonChunk() {
    if (!canonPlaying || currentCanonIndex >= canonChunks.length) {
      canonPlaying = false;
      addLog('Canon playback complete', 'canon');
      return;
    }
    
    const chunk = canonChunks[currentCanonIndex];
    
    if (chunk.matrix && epistemicSquare) {
      epistemicSquare.setMatrix(chunk.matrix);
    }
    if (chunk.angle && epistemicSquare) {
      epistemicSquare.setAngle(chunk.angle);
    }
    
    let displayText = '';
    if (chunk.text) displayText = chunk.text.slice(0, 80);
    else if (chunk.quote) displayText = `"${chunk.quote.slice(0, 60)}..."`;
    else if (chunk.verse) displayText = `${chunk.verse}.${chunk.chapter}:${chunk.verse}`;
    else if (chunk.event === 'series_start') displayText = `[${chunk.title}]`;
    else if (chunk.event === 'series_end') displayText = `[END ${chunk.series}]`;
    else if (chunk.event === 'covenant') displayText = `${chunk.id}: ${chunk.title}`;
    else if (chunk.event === 'character') displayText = `${chunk.name}: ${chunk.quote?.slice(0, 40)}`;
    
    if (displayText) {
      addLog(displayText, 'canon');
    }
    
    currentCanonIndex++;
    
    const delay = chunk.event === 'series_start' || chunk.event === 'series_end' ? 1500 : 200;
    canonTimeout = setTimeout(playNextCanonChunk, delay);
  }
  
  function stopCanon() {
    canonPlaying = false;
    if (canonTimeout) {
      clearTimeout(canonTimeout);
      canonTimeout = null;
    }
    addLog('Canon stopped', 'canon');
  }
  
  async function searchCanon(term) {
    if (!canonManifest) await loadCanonManifest();
    
    const seriesList = canonManifest.filter(e => e.event === 'series');
    const results = [];
    
    for (const series of seriesList) {
      try {
        const response = await fetch(series.path);
        const text = await response.text();
        const chunks = text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
        
        chunks.forEach((chunk, idx) => {
          const searchStr = JSON.stringify(chunk).toLowerCase();
          if (searchStr.includes(term.toLowerCase())) {
            results.push({ series: series.name, index: idx, chunk });
          }
        });
      } catch (e) {
        console.error(`Error searching ${series.name}:`, e);
      }
    }
    
    addLog(`Found ${results.length} matches for "${term}"`, 'canon');
    return results;
  }
  
  let canonPlayer = null;
  let canonRecorder = null;
  
  async function initAndLoadCanon() {
    if (!canonPlayer && epistemicSquare) {
      canonPlayer = new CanonPlayer(epistemicSquare);
      
      canonPlayer.onProgress = (progress, chunk, index, total) => {
        const scrubber = document.getElementById('canon-scrubber');
        if (scrubber) scrubber.value = progress;
        
        const position = document.getElementById('canon-position');
        if (position) position.textContent = `${index}/${total}`;
        
        const title = document.getElementById('canon-current-title');
        const textEl = document.getElementById('canon-current-text');
        if (title) title.textContent = chunk?.title || chunk?.event || chunk?.series || '';
        if (textEl) textEl.textContent = chunk?.text || chunk?.verse || chunk?.quote || '';
      };
      
      canonPlayer.onComplete = () => {
        addLog('Canon playback complete', 'canon');
        const playBtn = document.getElementById('canon-play');
        if (playBtn) playBtn.textContent = '▶ Play';
      };
    }
    
    if (canonPlayer) {
      await canonPlayer.loadCanon();
      addLog(`Canon loaded: ${canonPlayer.chunks.length} chunks`, 'canon');
      
      const position = document.getElementById('canon-position');
      if (position) position.textContent = `0/${canonPlayer.chunks.length}`;
    }
  }
  
  function playCanon() {
    if (!canonPlayer) {
      initAndLoadCanon().then(() => {
        if (canonPlayer) {
          canonPlayer.play();
          addLog('Playing canon...', 'canon');
        }
      });
      return;
    }
    
    if (canonPlayer.isPlaying) {
      canonPlayer.pause();
      addLog('Canon paused', 'canon');
    } else {
      canonPlayer.play();
      addLog('Playing canon...', 'canon');
    }
  }
  
  function pauseCanon() {
    if (canonPlayer) {
      canonPlayer.pause();
      addLog('Canon paused', 'canon');
    }
  }
  
  function stopCanon() {
    if (canonPlayer) {
      canonPlayer.stop();
      addLog('Canon stopped', 'canon');
    }
    
    if (canonRecorder && canonRecorder.isActive()) {
      canonRecorder.stopRecording();
    }
  }
  
  function scrubCanon(e) {
    if (canonPlayer) {
      const pos = parseFloat(e.target.value) / 100;
      canonPlayer.seek(pos);
    }
  }
  
  function speedCanon(e) {
    if (canonPlayer) {
      const speed = parseFloat(e.target.value);
      canonPlayer.setSpeed(speed);
      const speedVal = document.getElementById('canon-speed-val');
      if (speedVal) speedVal.textContent = `${speed.toFixed(1)}x`;
      addLog(`Playback speed: ${speed.toFixed(1)}x`, 'canon');
    }
  }

  async function selectCanonSeries(e) {
    const seriesName = e.target.value;
    const statusEl = document.getElementById('canon-status');
    if (statusEl) statusEl.textContent = `Loading ${seriesName}...`;
    
    if (canonPlayer) {
      await canonPlayer.loadCanon(`canon-${seriesName}.ndjson`);
      addLog(`Loaded ${seriesName}: ${canonPlayer.chunks.length} chunks`, 'canon');
      const position = document.getElementById('canon-position');
      if (position) position.textContent = `0/${canonPlayer.chunks.length}`;
      const scrubber = document.getElementById('canon-scrubber');
      if (scrubber) scrubber.value = 0;
      if (statusEl) statusEl.textContent = 'Ready';
    }
  }
  
  function toggleRecording() {
    const btn = document.getElementById('canon-record');
    const recStatus = document.getElementById('canon-recording');
    
    if (!canonRecorder) {
      const canvas = document.querySelector('#epistemic-canvas canvas') || 
                    document.querySelector('canvas');
      if (canvas) {
        canonRecorder = new CanonRecorder(canvas);
      }
    }
    
    if (canonRecorder) {
      if (canonRecorder.isActive()) {
        canonRecorder.stopRecording();
        if (btn) {
          btn.textContent = '⏺ Record';
          btn.classList.remove('recording');
        }
        if (recStatus) recStatus.textContent = 'Inactive';
        if (recStatus) recStatus.style.color = '#666';
      } else {
        canonRecorder.startRecording();
        if (btn) {
          btn.textContent = '⏹ Stop';
          btn.classList.add('recording');
        }
        if (recStatus) {
          recStatus.textContent = 'Recording...';
          recStatus.style.color = '#ff0000';
        }
      }
    }
  }
  
  document.addEventListener('DOMContentLoaded', init);
  
  return {};
})();
