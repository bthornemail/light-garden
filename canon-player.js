class CanonPlayer {
  constructor(epistemicSquare) {
    this.square = epistemicSquare;
    this.chunks = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.playbackRate = 1.0;
    this.startTime = 0;
    this.onProgress = null;
    this.onChunk = null;
    this.onComplete = null;
    this.timeout = null;
    
    this.tts = window.speechSynthesis;
    this.voices = [];
    this.currentUtterance = null;
    
    this.characterVoices = {
      'Metatron': { pitch: 0.8, rate: 0.85 },
      'Solomon': { pitch: 0.9, rate: 0.8 },
      'Solon': { pitch: 1.0, rate: 0.85 },
      'Enoch': { pitch: 0.95, rate: 0.8 },
      'Asabiyyah': { pitch: 1.1, rate: 0.95 },
      'Speaker': { pitch: 1.05, rate: 0.9 },
      'Number': { pitch: 0.7, rate: 0.7 },
      'Logos': { pitch: 0.85, rate: 0.8 },
      'default': { pitch: 1.0, rate: 0.9 }
    };
    
    this.loadVoices();
  }
  
  loadVoices() {
    const load = () => {
      this.voices = this.tts.getVoices();
    };
    load();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = load;
    }
  }
  
  async loadCanon(manifestUrl = 'canon-manifest.ndjson') {
    const manifestResponse = await fetch(manifestUrl);
    const manifestText = await manifestResponse.text();
    const manifest = manifestText.split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l));
    
    this.chunks = [];
    
    for (const entry of manifest) {
      if (entry.event === 'series') {
        try {
          const response = await fetch(entry.path);
          const text = await response.text();
          const seriesChunks = text.split('\n')
            .filter(l => l.trim())
            .map(l => JSON.parse(l));
          
          seriesChunks.forEach(chunk => {
            chunk.series = entry.name;
            this.chunks.push(chunk);
          });
        } catch (e) {
          console.error(`Error loading ${entry.path}:`, e);
        }
      }
    }
    
    this.chunks.sort((a, b) => (a.t || a.timestamp || 0) - (b.t || b.timestamp || 0));
    
    if (window.addLog) {
      window.addLog(`Loaded ${this.chunks.length} canon chunks`, 'canon');
    }
    
    return this.chunks.length;
  }
  
  play() {
    if (this.chunks.length === 0) {
      if (window.addLog) window.addLog('No canon loaded', 'error');
      return;
    }
    
    if (this.isPaused) {
      this.isPaused = false;
      this.isPlaying = true;
      this.playChunk();
      return;
    }
    
    this.isPlaying = true;
    this.isPaused = false;
    this.playChunk();
  }
  
  playChunk() {
    if (!this.isPlaying || this.isPaused) return;
    if (this.currentIndex >= this.chunks.length) {
      this.isPlaying = false;
      if (this.onComplete) this.onComplete();
      return;
    }
    
    const chunk = this.chunks[this.currentIndex];
    
    if (this.square) {
      if (chunk.matrix) this.square.setMatrix(chunk.matrix);
      if (chunk.angle) this.square.setAngle(chunk.angle);
    }
    
    this.speakChunk(chunk);
    
    const progress = (this.currentIndex / Math.max(1, this.chunks.length - 1)) * 100;
    if (this.onProgress) this.onProgress(progress, chunk, this.currentIndex, this.chunks.length);
    if (this.onChunk) this.onChunk(chunk, this.currentIndex);
    
    this.currentIndex++;
    
    const baseDelay = 150;
    const textDelay = chunk.text ? chunk.text.length * 30 : 
                      chunk.verse ? 200 : 
                      chunk.quote ? chunk.quote.length * 25 : 100;
    const delay = Math.min(5000, Math.max(baseDelay, textDelay)) / this.playbackRate;
    
    this.timeout = setTimeout(() => this.playChunk(), delay);
  }
  
  speakChunk(chunk) {
    let text = chunk.text || chunk.verse || chunk.quote || chunk.title || '';
    if (!text) return;
    
    this.tts.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    let character = chunk.character || chunk.speaker || 'default';
    const voiceConfig = this.characterVoices[character] || this.characterVoices.default;
    
    const voice = this.voices.find(v => 
      v.name.includes('English') && (v.name.includes('Male') || v.name.includes('Female'))
    );
    if (voice) utterance.voice = voice;
    
    utterance.pitch = voiceConfig.pitch;
    utterance.rate = voiceConfig.rate * this.playbackRate;
    
    utterance.onend = () => {
      this.currentUtterance = null;
    };
    
    this.currentUtterance = utterance;
    this.tts.speak(utterance);
  }
  
  pause() {
    this.isPlaying = false;
    this.isPaused = true;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.tts.cancel();
  }
  
  stop() {
    this.pause();
    this.isPaused = false;
    this.currentIndex = 0;
    if (this.onProgress) this.onProgress(0, null, 0, this.chunks.length);
  }
  
  seek(position) {
    this.pause();
    this.isPaused = false;
    this.currentIndex = Math.floor(Math.max(0, Math.min(1, position)) * (this.chunks.length - 1));
    
    if (this.onProgress) {
      const progress = (this.currentIndex / Math.max(1, this.chunks.length - 1)) * 100;
      this.onProgress(progress, this.chunks[this.currentIndex], this.currentIndex, this.chunks.length);
    }
    
    const chunk = this.chunks[this.currentIndex];
    if (chunk && this.square) {
      if (chunk.matrix) this.square.setMatrix(chunk.matrix);
      if (chunk.angle) this.square.setAngle(chunk.angle);
    }
  }
  
  setSpeed(speed) {
    this.playbackRate = Math.max(0.5, Math.min(2.0, speed));
  }
  
  getCurrentChunk() {
    return this.chunks[this.currentIndex] || null;
  }
  
  getProgress() {
    return {
      current: this.currentIndex,
      total: this.chunks.length,
      percent: (this.currentIndex / Math.max(1, this.chunks.length)) * 100
    };
  }
}

class CanonRecorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.stream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
  }
  
  startRecording(format = 'webm') {
    if (!this.canvas) {
      if (window.addLog) window.addLog('No canvas for recording', 'error');
      return false;
    }
    
    try {
      this.stream = this.canvas.captureStream(30);
    } catch (e) {
      if (window.addLog) window.addLog('Canvas capture not supported', 'error');
      return false;
    }
    
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
      ? 'video/webm;codecs=vp9' 
      : 'video/webm';
    
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: mimeType,
      videoBitsPerSecond: 2500000
    });
    
    this.recordedChunks = [];
    
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };
    
    this.mediaRecorder.onstop = () => {
      this.finalizeRecording();
    };
    
    this.mediaRecorder.start(100);
    this.isRecording = true;
    
    if (window.addLog) window.addLog('Recording started', 'recording');
    return true;
  }
  
  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.isRecording = false;
      
      this.stream.getTracks().forEach(track => track.stop());
    }
  }
  
  finalizeRecording() {
    if (this.recordedChunks.length === 0) return;
    
    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `fano-canon-${Date.now()}.webm`;
    a.click();
    
    URL.revokeObjectURL(url);
    
    if (window.addLog) {
      window.addLog(`Recording saved: ${(blob.size / 1024 / 1024).toFixed(2)} MB`, 'recording');
    }
  }
  
  isActive() {
    return this.isRecording;
  }
}

window.CanonPlayer = CanonPlayer;
window.CanonRecorder = CanonRecorder;
