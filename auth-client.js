class AuthClient {
  constructor() {
    this.serviceWorker = null;
    this.peerId = this.generatePeerId();
    this.role = 'OBSERVER';
    this.token = null;
    this.authenticated = false;
    this.peers = new Map();
    this.onPeerListUpdate = null;
    this.onRoleChange = null;
    this.onAuthChange = null;
    this.peerConnections = new Map();
    this.dataChannels = new Map();
    this.onMessage = null;
    this.init();
  }
  
  generatePeerId() {
    return 'peer-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
  }
  
  async init() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('sw-auth.js');
        this.serviceWorker = registration.active || registration.installing || registration.waiting;
        
        navigator.serviceWorker.addEventListener('message', (event) => {
          this.handleServiceWorkerMessage(event.data);
        });
        
        await navigator.serviceWorker.ready;
        await this.register();
        
      } catch (error) {
        console.error('Service worker registration failed:', error);
        if (window.addLog) {
          window.addLog('SW registration failed: ' + error.message, 'error');
        }
      }
    } else {
      console.warn('Service Worker not supported');
      if (window.addLog) {
        window.addLog('Service Worker not supported', 'warn');
      }
    }
  }
  
  async register(role = 'OBSERVER') {
    try {
      const response = await this.sendMessage('REGISTER_PEER', {
        peerId: this.peerId,
        role: role
      });
      
      if (response.success) {
        this.token = response.token;
        this.role = response.role;
        this.authenticated = true;
        if (this.onAuthChange) this.onAuthChange(true, this.role);
        if (window.addLog) {
          window.addLog(`Registered as ${this.role}`, 'auth');
        }
      }
      return response;
    } catch (e) {
      if (window.addLog) {
        window.addLog('Registration failed: ' + e.message, 'error');
      }
      return { success: false, error: e.message };
    }
  }
  
  async sendMessage(type, data) {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => resolve(e.data);
      
      if (this.serviceWorker) {
        this.serviceWorker.postMessage({ type, data }, [channel.port2]);
      } else if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type, data }, [channel.port2]);
      } else {
        resolve({ success: false, error: 'No service worker' });
      }
    });
  }
  
  handleServiceWorkerMessage(message) {
    switch (message.type) {
      case 'PEER_LIST_UPDATE':
        this.peers = new Map(message.peers.map(p => [p.id, p]));
        if (this.onPeerListUpdate) this.onPeerListUpdate(Array.from(this.peers.values()));
        break;
        
      case 'ROLE_CHANGE':
        this.role = message.newRole;
        this.token = message.newToken;
        this.authenticated = true;
        if (this.onRoleChange) this.onRoleChange(message.newRole);
        if (window.addLog) {
          window.addLog(`Role changed to ${message.newRole}`, 'auth');
        }
        break;
        
      case 'WEBRTC_SIGNAL':
        this.handleWebRTCSignal(message.from, message.signal);
        break;
    }
  }
  
  async authenticate() {
    if (!this.token) return false;
    
    const response = await this.sendMessage('AUTHENTICATE', { token: this.token });
    this.authenticated = response.authenticated;
    if (response.peer) {
      this.role = response.peer.role;
    }
    if (this.onAuthChange) this.onAuthChange(response.authenticated, this.role);
    return response.authenticated;
  }
  
  async getPeers() {
    const response = await this.sendMessage('GET_PEERS', {});
    return response.peers || [];
  }
  
  async connectToPeer(targetId) {
    if (!this.hasPermission('send')) {
      console.error('No permission to send');
      return null;
    }
    
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    const peerConnection = new RTCPeerConnection(config);
    const dataChannel = peerConnection.createDataChannel('fano-garden', {
      ordered: true
    });
    
    this.setupDataChannel(targetId, peerConnection, dataChannel);
    
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(targetId, { candidate: event.candidate });
      }
    };
    
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    await this.sendSignal(targetId, { offer: peerConnection.localDescription });
    
    this.peerConnections.set(targetId, peerConnection);
    this.dataChannels.set(targetId, dataChannel);
    
    return { peerConnection, dataChannel };
  }
  
  setupDataChannel(targetId, peerConnection, dataChannel) {
    dataChannel.onopen = () => {
      if (window.addLog) {
        window.addLog(`Data channel open with ${targetId.slice(0, 8)}...`, 'network');
      }
    };
    
    dataChannel.onclose = () => {
      if (window.addLog) {
        window.addLog(`Data channel closed with ${targetId.slice(0, 8)}...`, 'network');
      }
    };
    
    dataChannel.onerror = (e) => {
      if (window.addLog) {
        window.addLog(`Data channel error with ${targetId.slice(0, 8)}...`, 'error');
      }
    };
    
    dataChannel.onmessage = (e) => {
      if (!this.hasPermission('receive')) {
        console.warn('Received message but no receive permission');
        return;
      }
      
      if (this.onMessage) {
        try {
          this.onMessage(targetId, JSON.parse(e.data));
        } catch (err) {
          this.onMessage(targetId, { raw: e.data });
        }
      }
    };
  }
  
  async handleWebRTCSignal(from, signal) {
    let peerConnection = this.peerConnections.get(from);
    
    if (!peerConnection) {
      const config = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      };
      
      peerConnection = new RTCPeerConnection(config);
      
      peerConnection.ondatachannel = (event) => {
        const dataChannel = event.channel;
        this.dataChannels.set(from, dataChannel);
        this.setupDataChannel(from, peerConnection, dataChannel);
      };
      
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal(from, { candidate: event.candidate });
        }
      };
      
      this.peerConnections.set(from, peerConnection);
    }
    
    if (signal.offer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await this.sendSignal(from, { answer: peerConnection.localDescription });
    } else if (signal.answer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
    } else if (signal.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  }
  
  async sendSignal(to, signal) {
    try {
      const response = await fetch('/webrtc-signaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: this.peerId,
          to: to,
          signal: signal,
          token: this.token
        })
      });
      return await response.json();
    } catch (e) {
      console.error('Signal send error:', e);
      return { error: e.message };
    }
  }
  
  async sendToPeer(peerId, data) {
    if (!this.hasPermission('send')) {
      if (window.addLog) window.addLog('No send permission', 'warn');
      return false;
    }
    
    const channel = this.dataChannels.get(peerId);
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(data));
      return true;
    }
    return false;
  }
  
  async broadcast(data) {
    if (!this.hasPermission('send')) {
      if (window.addLog) window.addLog('No send permission', 'warn');
      return;
    }
    
    for (const [peerId, channel] of this.dataChannels) {
      if (channel.readyState === 'open') {
        try {
          channel.send(JSON.stringify(data));
        } catch (e) {
          console.error('Broadcast error to', peerId, e);
        }
      }
    }
  }
  
  async changePeerRole(targetId, newRole) {
    if (!this.hasPermission('manage')) {
      if (window.addLog) window.addLog('No manage permission', 'warn');
      return { success: false, error: 'Permission denied' };
    }
    
    try {
      const response = await fetch('/role-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: targetId,
          newRole: newRole,
          token: this.token
        })
      });
      return await response.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  async promoteToSpeaker(peerId) {
    return this.changePeerRole(peerId, 'SPEAKER');
  }
  
  async promoteToTrustee(peerId) {
    return this.changePeerRole(peerId, 'TRUSTEE');
  }
  
  async promoteToAdmin(peerId) {
    return this.changePeerRole(peerId, 'ADMIN');
  }
  
  async demoteToObserver(peerId) {
    return this.changePeerRole(peerId, 'OBSERVER');
  }
  
  hasPermission(action) {
    const rolePerms = {
      'ADMIN': ['send', 'receive', 'manage', 'add_peers', 'remove_peers', 'view_all', 'modify_state'],
      'SPEAKER': ['send', 'receive', 'federate', 'view_all', 'ask_questions'],
      'TRUSTEE': ['receive', 'view_own', 'view_public'],
      'OBSERVER': ['receive', 'view_public']
    };
    
    return rolePerms[this.role]?.includes(action) || false;
  }
  
  getPermissions() {
    const rolePerms = {
      'ADMIN': ['send', 'receive', 'manage', 'add_peers', 'remove_peers', 'view_all', 'modify_state'],
      'SPEAKER': ['send', 'receive', 'federate', 'view_all', 'ask_questions'],
      'TRUSTEE': ['receive', 'view_own', 'view_public'],
      'OBSERVER': ['receive', 'view_public']
    };
    return rolePerms[this.role] || [];
  }
  
  disconnect() {
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.dataChannels.clear();
    
    fetch('/peer-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        peerId: this.peerId,
        token: this.token,
        action: 'disconnect'
      })
    });
  }
}

window.AuthClient = AuthClient;
