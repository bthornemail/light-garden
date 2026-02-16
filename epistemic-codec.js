class EpistemicCodec {
  constructor(epistemicSquare) {
    this.square = epistemicSquare;
    this.chunks = [];
    this.playing = false;
    this.receiving = false;
    this.currentChunk = 0;
    this.onProgress = null;
    this.onComplete = null;
    this.transmitRate = 100;
    
    this.mediaTypes = {
      'image': { quadrant: 'KK', color: '#00ff00', ext: ['jpg','jpeg','png','gif','bmp','webp'] },
      'audio': { quadrant: 'KU', color: '#ffff00', ext: ['mp3','wav','ogg','flac','aac','m4a'] },
      'video': { quadrant: 'UK', color: '#ff8800', ext: ['mp4','webm','avi','mov','mkv'] },
      'model': { quadrant: 'UU', color: '#0000ff', ext: ['glb','gltf','obj','stl','fbx'] },
      'text':  { quadrant: 'KK', color: '#00ff00', ext: ['txt','json','md','csv','xml','html','css','js'] },
      'other': { quadrant: 'UU', color: '#0000ff', ext: ['*'] }
    };
    
    this.receivedChunks = [];
    this.receivedHeader = null;
    this.expectedTotal = 0;
    this.receivedType = 'other';
  }
  
  async encodeFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target.result;
          const bytes = new Uint8Array(arrayBuffer);
          
          const ext = file.name.split('.').pop().toLowerCase();
          const type = this.getMediaType(ext);
          
          const header = this.createHeader(file, type, bytes.length);
          this.chunks = [header];
          
          for (let i = 0; i < bytes.length; i += 3) {
            const chunkBytes = [
              bytes[i],
              i+1 < bytes.length ? bytes[i+1] : 0,
              i+2 < bytes.length ? bytes[i+2] : 0
            ];
            const dataChunk = this.createDataChunk(chunkBytes, Math.floor(i/3));
            this.chunks.push(dataChunk);
          }
          
          const footer = this.createFooter(this.chunks.length - 1);
          this.chunks.push(footer);
          
          if (typeof addLog === 'function') {
            addLog(`Encoded ${file.name}: ${this.chunks.length} chunks (${bytes.length} bytes)`, 'media');
          }
          resolve(this.chunks.length);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
  
  createHeader(file, type, totalBytes) {
    const magic = [0x45, 0x50, 0x49, 0x53, 0x54, 0x45, 0x4D, 0x49, 0x43];
    const typeMap = { 'image': 1, 'audio': 2, 'video': 3, 'model': 4, 'text': 5, 'other': 6 };
    
    const headerBytes = new Uint8Array(12);
    for (let i = 0; i < 9; i++) headerBytes[i] = magic[i];
    headerBytes[9] = typeMap[type] || 6;
    headerBytes[10] = (totalBytes >> 8) & 0xFF;
    headerBytes[11] = totalBytes & 0xFF;
    
    const subChunks = [];
    for (let i = 0; i < 12; i += 3) {
      subChunks.push([headerBytes[i], headerBytes[i+1], headerBytes[i+2]]);
    }
    
    return {
      type: 'header',
      index: 0,
      subChunks: subChunks,
      matrix: [0,0,0,0,0,0,0],
      angle: 0
    };
  }
  
  createDataChunk(bytes, index) {
    const value = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
    const quadrantBits = (value >> 10) & 0x3FFF;
    const angleBits = value & 0x3FF;
    
    const matrix = [];
    for (let p = 0; p < 7; p++) {
      matrix[p] = (quadrantBits >> (p * 2)) & 0x3;
    }
    
    const angle = (angleBits / 1024) * 360;
    
    return {
      type: 'data',
      index: index + 1,
      bytes: bytes,
      value: value,
      matrix: matrix,
      angle: angle
    };
  }
  
  createFooter(totalChunks) {
    return {
      type: 'footer',
      index: totalChunks,
      matrix: [3,3,3,3,3,3,3],
      angle: 359.9
    };
  }
  
  transmit(intervalMs = 100) {
    if (this.chunks.length === 0) {
      if (typeof addLog === 'function') addLog('No encoded data to transmit', 'error');
      return;
    }
    
    this.playing = true;
    this.currentChunk = 0;
    this.transmitRate = intervalMs;
    
    const step = () => {
      if (!this.playing || this.currentChunk >= this.chunks.length) {
        this.playing = false;
        if (this.onComplete) this.onComplete();
        return;
      }
      
      const chunk = this.chunks[this.currentChunk];
      
      if (chunk.type === 'header') {
        this.transmitHeader(chunk, () => {
          this.currentChunk++;
          setTimeout(step, intervalMs * 2);
        });
      } else {
        this.transmitChunk(chunk);
        
        const progress = Math.round((this.currentChunk / (this.chunks.length - 1)) * 100);
        if (this.onProgress) this.onProgress(progress);
        
        this.currentChunk++;
        setTimeout(step, intervalMs);
      }
    };
    
    step();
  }
  
  transmitHeader(header, callback) {
    let subIndex = 0;
    
    const sendSubChunk = () => {
      if (subIndex >= header.subChunks.length) {
        callback();
        return;
      }
      
      const bytes = header.subChunks[subIndex];
      const value = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
      const quadrantBits = (value >> 10) & 0x3FFF;
      const angleBits = value & 0x3FF;
      
      const matrix = [];
      for (let p = 0; p < 7; p++) {
        matrix[p] = (quadrantBits >> (p * 2)) & 0x3;
      }
      const angle = (angleBits / 1024) * 360;
      
      if (this.square) {
        this.square.setMatrix ? this.square.setMatrix(matrix) : null;
        this.square.setAngle ? this.square.setAngle(angle) : null;
      }
      
      window.dispatchEvent(new CustomEvent('epistemicTransmit', {
        detail: { type: 'header', subIndex, bytes, matrix, angle }
      }));
      
      subIndex++;
      setTimeout(sendSubChunk, this.transmitRate);
    };
    
    sendSubChunk();
  }
  
  transmitChunk(chunk) {
    if (this.square) {
      if (this.square.setMatrix) this.square.setMatrix(chunk.matrix);
      if (this.square.setAngle) this.square.setAngle(chunk.angle);
    }
    
    window.dispatchEvent(new CustomEvent('epistemicTransmit', {
      detail: {
        type: chunk.type,
        index: chunk.index || 0,
        bytes: chunk.bytes,
        matrix: chunk.matrix,
        angle: chunk.angle
      }
    }));
  }
  
  startReceiving() {
    this.receiving = true;
    this.receivedChunks = [];
    this.receivedHeader = null;
    this.expectedTotal = 0;
    
    window.addEventListener('epistemicTransmit', (e) => {
      if (!this.receiving) return;
      this.receiveChunk(e.detail);
    });
  }
  
  receiveChunk(detail) {
    const { matrix, angle, bytes } = detail;
    
    if (!matrix || !angle) return;
    
    let quadrantBits = 0;
    for (let p = 0; p < 7; p++) {
      quadrantBits |= (matrix[p] << (p * 2));
    }
    const angleBits = Math.round((angle / 360) * 1023) & 0x3FF;
    const value = (quadrantBits << 10) | angleBits;
    
    const chunkBytes = [
      (value >> 16) & 0xFF,
      (value >> 8) & 0xFF,
      value & 0xFF
    ];
    
    if (chunkBytes[0] === 0x45 && chunkBytes[1] === 0x50 && chunkBytes[2] === 0x49) {
      this.receivedHeader = [];
      this.receivedHeader.push(chunkBytes);
    }
    else if (this.receivedHeader) {
      this.receivedHeader.push(chunkBytes);
      if (this.receivedHeader.length === 4) {
        this.processHeader(this.receivedHeader);
        this.receivedHeader = null;
      }
    }
    else if (chunkBytes[0] === 0xFF && chunkBytes[1] === 0xFF) {
      this.processFooter();
    }
    else {
      this.receivedChunks.push(chunkBytes);
      window.dispatchEvent(new CustomEvent('epistemicReceive', {
        detail: { received: this.receivedChunks.length, total: this.expectedTotal }
      }));
    }
  }
  
  processHeader(headerChunks) {
    const headerBytes = [];
    headerChunks.forEach(c => headerBytes.push(...c));
    
    const typeCode = headerBytes[9];
    const totalBytes = (headerBytes[10] << 8) | headerBytes[11];
    
    const typeMap = { 1: 'image', 2: 'audio', 3: 'video', 4: 'model', 5: 'text', 6: 'other' };
    this.receivedType = typeMap[typeCode] || 'other';
    this.expectedTotal = totalBytes;
    
    if (typeof addLog === 'function') {
      addLog(`Receiving ${this.receivedType}: ${totalBytes} bytes`, 'media');
    }
  }
  
  processFooter() {
    this.assembleFile();
  }
  
  assembleFile() {
    const bytes = [];
    this.receivedChunks.forEach(c => bytes.push(...c));
    const exactBytes = bytes.slice(0, this.expectedTotal);
    
    const mimes = {
      'image': 'image/jpeg',
      'audio': 'audio/mpeg',
      'video': 'video/mp4',
      'model': 'model/gltf-binary',
      'text': 'text/plain',
      'other': 'application/octet-stream'
    };
    
    const blob = new Blob([new Uint8Array(exactBytes)], { type: mimes[this.receivedType] || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    window.dispatchEvent(new CustomEvent('epistemicFileReceived', {
      detail: { blob, url, type: this.receivedType, size: this.expectedTotal }
    }));
    
    if (typeof addLog === 'function') {
      addLog(`File received: ${this.receivedType}, ${this.expectedTotal} bytes`, 'media');
    }
    
    this.receiving = false;
    this.receivedChunks = [];
  }
  
  getMediaType(ext) {
    for (const [type, info] of Object.entries(this.mediaTypes)) {
      if (info.ext.includes(ext) || info.ext.includes('*')) return type;
    }
    return 'other';
  }
  
  saveAsNDJSON() {
    const lines = this.chunks.map(chunk => {
      if (chunk.type === 'header') {
        return JSON.stringify({
          event: 'media_header',
          index: chunk.index,
          subChunks: chunk.subChunks
        });
      } else {
        return JSON.stringify({
          event: 'media_chunk',
          index: chunk.index,
          matrix: chunk.matrix,
          angle: chunk.angle,
          bytes: Array.from(chunk.bytes || [])
        });
      }
    }).join('\n');
    
    const blob = new Blob([lines], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `epistemic-${Date.now()}.ndjson`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  loadFromNDJSON(ndjson) {
    this.chunks = [];
    const lines = ndjson.split('\n').filter(l => l.trim());
    
    lines.forEach(line => {
      const obj = JSON.parse(line);
      if (obj.event === 'media_header') {
        this.chunks.push({
          type: 'header',
          index: 0,
          subChunks: obj.subChunks
        });
      } else {
        this.chunks.push({
          type: 'data',
          index: obj.index,
          matrix: obj.matrix,
          angle: obj.angle,
          bytes: new Uint8Array(obj.bytes)
        });
      }
    });
    
    if (typeof addLog === 'function') {
      addLog(`Loaded ${this.chunks.length} chunks from NDJSON`, 'media');
    }
  }
  
  clear() {
    this.chunks = [];
    this.playing = false;
    this.currentChunk = 0;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EpistemicCodec;
}
