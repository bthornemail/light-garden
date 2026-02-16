class Dome3DViewer {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.width = options.width || 400;
    this.height = options.height || 400;
    this.rotationX = options.rotationX || -0.3;
    this.rotationY = options.rotationY || 0;
    this.zoom = options.zoom || 1.5;
    this.leds = [];
    this.highlightedLeds = new Set();
    this.autoRotate = options.autoRotate || false;
    this.rotationSpeed = options.rotationSpeed || 0.005;
    
    this.init();
  }
  
  init() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.cssText = 'display:block; margin:0 auto; border-radius:8px; cursor:grab;';
    this.container.appendChild(this.canvas);
    
    this.ctx = this.canvas.getContext('2d');
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    
    this.setupEvents();
    this.loadLeds();
  }
  
  setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    });
    
    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.canvas.style.cursor = 'grab';
    });
    
    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      
      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;
      
      this.rotationY += deltaX * 0.01;
      this.rotationX += deltaY * 0.01;
      
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });
    
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom *= e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.max(0.5, Math.min(3, this.zoom));
    });
    
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.handleClick(x, y);
    });
  }
  
  async loadLeds() {
    try {
      const response = await fetch('dome-leds.json');
      const data = await response.json();
      this.leds = data;
      this.render();
    } catch (e) {
      console.log('Loading dome-leds.ndjson instead...');
      try {
        const response = await fetch('dome-leds.ndjson');
        const text = await response.text();
        this.leds = text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
      } catch (e2) {
        console.error('Failed to load LED data:', e2);
      }
    }
  }
  
  project(x, y, z) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    
    let xr = x;
    let yr = y * Math.cos(this.rotationX) - z * Math.sin(this.rotationX);
    let zr = y * Math.sin(this.rotationX) + z * Math.cos(this.rotationX);
    
    const xr2 = xr * Math.cos(this.rotationY) - zr * Math.sin(this.rotationY);
    const zr2 = xr * Math.sin(this.rotationY) + zr * Math.cos(this.rotationY);
    
    const factor = 400 / (400 + zr2 + 100);
    
    return {
      x: cx + xr2 * factor * this.zoom,
      y: cy - yr * factor * this.zoom,
      z: zr2,
      factor: factor
    };
  }
  
  render() {
    const ctx = this.ctx;
    
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, this.width, this.height);
    
    if (this.leds.length === 0) {
      ctx.fillStyle = '#444';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Loading dome LEDs...', this.width/2, this.height/2);
      requestAnimationFrame(() => this.render());
      return;
    }
    
    const projected = this.leds.map(led => {
      const proj = this.project(led.x, led.y, led.z);
      return { ...led, px: proj.x, py: proj.y, z: proj.z, factor: proj.factor };
    });
    
    projected.sort((a, b) => b.z - a.z);
    
    projected.forEach(led => {
      if (led.factor <= 0) return;
      
      const size = Math.max(2, 6 * led.factor);
      const isHighlighted = this.highlightedLeds.has(led.id);
      
      ctx.beginPath();
      ctx.arc(led.px, led.py, isHighlighted ? size * 1.5 : size, 0, Math.PI * 2);
      
      const hue = led.h || 0;
      const sat = led.s || 255;
      const val = led.v || 255;
      ctx.fillStyle = `hsl(${hue}, ${sat/2.55}%, ${val/2.55}%)`;
      
      if (isHighlighted) {
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 15;
      } else {
        ctx.shadowBlur = 5 * led.factor;
      }
      
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    
    if (this.autoRotate) {
      this.rotationY += this.rotationSpeed;
    }
    
    requestAnimationFrame(() => this.render());
  }
  
  handleClick(x, y) {
    let closest = null;
    let closestDist = Infinity;
    
    this.leds.forEach(led => {
      const proj = this.project(led.x, led.y, led.z);
      const dist = Math.sqrt((x - proj.x) ** 2 + (y - proj.y) ** 2);
      if (dist < closestDist && dist < 20) {
        closest = led;
        closestDist = dist;
      }
    });
    
    if (closest) {
      const event = new CustomEvent('dome3DClick', {
        detail: {
          led: closest,
          path: closest.path
        }
      });
      window.dispatchEvent(event);
    }
  }
  
  highlightLed(ledId, duration = 2000) {
    this.highlightedLeds.add(ledId);
    setTimeout(() => {
      this.highlightedLeds.delete(ledId);
    }, duration);
  }
  
  highlightFano(fanoNum, duration = 2000) {
    this.leds.filter(led => led.fano === fanoNum).forEach(led => {
      this.highlightedLeds.add(led.id);
    });
    setTimeout(() => {
      this.leds.filter(led => led.fano === fanoNum).forEach(led => {
        this.highlightedLeds.delete(led.id);
      });
    }, duration);
  }
  
  highlightPole(poleNum, duration = 2000) {
    this.leds.filter(led => led.pole === poleNum).forEach(led => {
      this.highlightedLeds.add(led.id);
    });
    setTimeout(() => {
      this.leds.filter(led => led.pole === poleNum).forEach(led => {
        this.highlightedLeds.delete(led.id);
      });
    }, duration);
  }
  
  highlightBand(bandNum, duration = 2000) {
    this.leds.filter(led => led.band === bandNum).forEach(led => {
      this.highlightedLeds.add(led.id);
    });
    setTimeout(() => {
      this.leds.filter(led => led.band === bandNum).forEach(led => {
        this.highlightedLeds.delete(led.id);
      });
    }, duration);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Dome3DViewer;
}
