// MQTT + WebRTC Network Module for Fano Light Garden

const NETWORK = {
  config: {
    mqttBroker: 'ws://localhost:9001',
    signalingServer: 'ws://localhost:8080',
    peerId: null,
    isObserver: true
  },
  
  mqtt: null,
  peers: new Map(),
  peerConnection: null,
  dataChannel: null,
  
  gardenState: {},
  
  peerNames: ['Metatron', 'Solomon', 'Solon', 'Asabiyyah', 'Enoch', 'Speaker', 'Genesis', 'Observer'],
  
  init(peerId = null) {
    this.config.peerId = peerId || this.generatePeerId();
    this.connectMQTT();
    this.connectSignaling();
  },
  
  generatePeerId() {
    const names = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'white'];
    const idx = Math.floor(Math.random() * 7);
    return `${names[idx]}_${Date.now().toString(36)}`;
  },
  
  connectMQTT() {
    if (typeof mqtt === 'undefined') {
      console.log('MQTT library not loaded - running in offline mode');
      return;
    }
    
    try {
      this.mqtt = mqtt.connect(this.config.mqttBroker);
      
      this.mqtt.on('connect', () => {
        console.log('MQTT connected');
        this.mqtt.subscribe('m/240/#');
        this.mqtt.subscribe('m/60/#');
        this.mqtt.subscribe('m/7/#');
        this.mqtt.subscribe('garden/sync/#');
        NETWORK.onConnect();
      });
      
      this.mqtt.on('message', (topic, message) => {
        try {
          const state = JSON.parse(message.toString());
          this.handleMQTTMessage(topic, state);
        } catch (e) {
          console.error('MQTT message parse error:', e);
        }
      });
      
      this.mqtt.on('error', (err) => {
        console.error('MQTT error:', err);
      });
    } catch (e) {
      console.log('MQTT connection failed:', e);
    }
  },
  
  handleMQTTMessage(topic, state) {
    const path = topic;
    this.gardenState[path] = state;
    
    if (typeof app !== 'undefined' && app.onRemoteUpdate) {
      app.onRemoteUpdate(path, state);
    }
    
    this.broadcastToPeers({ type: 'update', topic, state });
  },
  
  publish(path, state) {
    if (this.mqtt && this.mqtt.connected) {
      this.mqtt.publish(path, JSON.stringify(state), { retain: true });
    }
    
    this.gardenState[path] = state;
  },
  
  connectSignaling() {
    try {
      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      this.dataChannel = this.peerConnection.createDataChannel('garden', {
        ordered: false,
        maxRetransmits: 0
      });
      
      this.setupDataChannel(this.dataChannel);
      
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignaling({ type: 'candidate', candidate: event.candidate });
        }
      };
      
      this.peerConnection.onconnectionstatechange = () => {
        console.log('Peer connection state:', this.peerConnection.connectionState);
      };
      
      this.peerConnection.createOffer().then(offer => {
        this.peerConnection.setLocalDescription(offer);
        this.sendSignaling({ type: 'offer', offer });
      });
    } catch (e) {
      console.log('WebRTC setup failed:', e);
    }
  },
  
  setupDataChannel(channel) {
    channel.onopen = () => {
      console.log('Data channel open');
      NETWORK.onPeerConnect();
    };
    
    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handlePeerMessage(data);
      } catch (e) {
        console.error('Peer message error:', e);
      }
    };
    
    channel.onclose = () => {
      console.log('Data channel closed');
    };
  },
  
  handlePeerMessage(data) {
    switch (data.type) {
      case 'update':
        this.gardenState[data.topic] = data.state;
        if (typeof app !== 'undefined' && app.onRemoteUpdate) {
          app.onRemoteUpdate(data.topic, data.state);
        }
        break;
        
      case 'sync-request':
        this.sendFullState(data.from);
        break;
        
      case 'sync-response':
        Object.assign(this.gardenState, data.state);
        if (typeof app !== 'undefined' && app.onFullSync) {
          app.onFullSync(data.state);
        }
        break;
        
      case 'peer-list':
        this.updatePeerList(data.peers);
        break;
        
      case 'offer':
        this.handleOffer(data.offer, data.from);
        break;
        
      case 'answer':
        this.handleAnswer(data.answer);
        break;
        
      case 'candidate':
        this.handleCandidate(data.candidate);
        break;
    }
  },
  
  broadcastToPeers(message) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(message));
    }
  },
  
  sendFullState(peerId) {
    this.broadcastToPeers({
      type: 'sync-response',
      state: this.gardenState,
      from: this.config.peerId
    });
  },
  
  requestSync() {
    this.broadcastToPeers({
      type: 'sync-request',
      from: this.config.peerId
    });
  },
  
  handleOffer(offer, from) {
    this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    this.peerConnection.createAnswer().then(answer => {
      this.peerConnection.setLocalDescription(answer);
      this.sendSignaling({ type: 'answer', answer, to: from });
    });
  },
  
  handleAnswer(answer) {
    this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  },
  
  handleCandidate(candidate) {
    this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  },
  
  sendSignaling(message) {
    const ws = new WebSocket(this.config.signalingServer);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        from: this.config.peerId,
        ...message
      }));
      ws.close();
    };
  },
  
  updatePeerList(peers) {
    console.log('Peers in garden:', peers);
  },
  
  onConnect() {
    console.log('Network: Connected to garden');
  },
  
  onPeerConnect() {
    console.log('Network: Peer connected');
  },
  
  disconnect() {
    if (this.mqtt) {
      this.mqtt.end();
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
  }
};

const VIEWPORTS = {
  canvas16: null,
  canvas8: null,
  canvas4: null,
  focusX: 0,
  focusY: 0,
  
  init() {
    this.canvas16 = document.getElementById('viewport-16');
    this.canvas8 = document.getElementById('viewport-8');
    this.canvas4 = document.getElementById('viewport-4');
    
    if (this.canvas16) this.render16x16();
    if (this.canvas8) this.render8x8();
    if (this.canvas4) this.render4x4();
    
    this.setupControls();
  },
  
  render16x16() {
    if (!this.canvas16) return;
    
    const ctx = this.canvas16.getContext('2d');
    const scale = this.canvas16.width / 16;
    
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, this.canvas16.width, this.canvas16.height);
    
    const state = NETWORK.gardenState;
    
    for (let i = 0; i < 256; i++) {
      const x = (i % 16) * scale;
      const y = Math.floor(i / 16) * scale;
      
      const path = `m/240'/${Math.floor(i / 60)}'/${i % 60}'`;
      const ledState = state[path];
      
      if (ledState) {
        ctx.fillStyle = `hsl(${ledState.h || 0}, ${(ledState.s || 255)/2.55}%, ${(ledState.v || 255)/2.55}%)`;
      } else {
        ctx.fillStyle = '#1a1a1a';
      }
      
      ctx.fillRect(x + 1, y + 1, scale - 2, scale - 2);
    }
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 1; i < 16; i++) {
      ctx.beginPath();
      ctx.moveTo(i * scale, 0);
      ctx.lineTo(i * scale, this.canvas16.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * scale);
      ctx.lineTo(this.canvas16.width, i * scale);
      ctx.stroke();
    }
  },
  
  render8x8() {
    if (!this.canvas8) return;
    
    const ctx = this.canvas8.getContext('2d');
    const scale = this.canvas8.width / 8;
    
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, this.canvas8.width, this.canvas8.height);
    
    const state = NETWORK.gardenState;
    const baseX = this.focusX * 8;
    const baseY = this.focusY * 8;
    
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * scale;
      const y = Math.floor(i / 8) * scale;
      
      const ledIdx = baseX + baseY * 16 + i;
      const path = `m/240'/${Math.floor(ledIdx / 60)}'/${ledIdx % 60}'`;
      const ledState = state[path];
      
      if (ledState) {
        ctx.fillStyle = `hsl(${ledState.h || 0}, ${(ledState.s || 255)/2.55}%, ${(ledState.v || 255)/2.55}%)`;
      } else {
        ctx.fillStyle = '#222';
      }
      
      ctx.fillRect(x + 1, y + 1, scale - 2, scale - 2);
    }
  },
  
  render4x4() {
    if (!this.canvas4) return;
    
    const ctx = this.canvas4.getContext('2d');
    const scale = this.canvas4.width / 4;
    
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, this.canvas4.width, this.canvas4.height);
    
    const controls = [
      [0, 0], [1, 0], [2, 0], [3, 0],
      [0, 1], [1, 1], [2, 1], [3, 1],
      [0, 2], [1, 2], [2, 2], [3, 2],
      [0, 3], [1, 3], [2, 3], [3, 3]
    ];
    
    const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#8f00ff', '#ffffff',
                    '#880000', '#884400', '#888800', '#008800', '#000088', '#440088', '#880088', '#888888'];
    
    controls.forEach(([x, y], i) => {
      ctx.fillStyle = colors[i];
      ctx.fillRect(x * scale + 2, y * scale + 2, scale - 4, scale - 4);
      
      ctx.fillStyle = '#000';
      ctx.font = `${scale * 0.25}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, x * scale + scale / 2, y * scale + scale / 2);
    });
  },
  
  setupControls() {
    document.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowRight': this.focusX = Math.min(1, this.focusX + 1); break;
        case 'ArrowLeft': this.focusX = Math.max(0, this.focusX - 1); break;
        case 'ArrowDown': this.focusY = Math.min(1, this.focusY + 1); break;
        case 'ArrowUp': this.focusY = Math.max(0, this.focusY - 1); break;
      }
      this.render8x8();
    });
    
    if (this.canvas4) {
      this.canvas4.addEventListener('click', (e) => {
        const rect = this.canvas4.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / (rect.width / 4));
        const y = Math.floor((e.clientY - rect.top) / (rect.height / 4));
        const idx = y * 4 + x;
        
        if (typeof app !== 'undefined') {
          app.onControl(idx);
        }
      });
    }
  },
  
  update() {
    this.render16x16();
    this.render8x8();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NETWORK, VIEWPORTS };
}
