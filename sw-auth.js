const CACHE_NAME = 'fano-auth-v1';

const ROLES = {
  ADMIN: {
    level: 3,
    can: ['send', 'receive', 'manage', 'add_peers', 'remove_peers', 'view_all', 'modify_state']
  },
  SPEAKER: {
    level: 2,
    can: ['send', 'receive', 'federate', 'view_all', 'ask_questions']
  },
  TRUSTEE: {
    level: 1,
    can: ['receive', 'view_own', 'view_public']
  },
  OBSERVER: {
    level: 0,
    can: ['receive', 'view_public']
  }
};

const peers = new Map();
const eventLog = [];

const SECRET_KEY = 'fano-garden-secret-' + Math.random().toString(36).substr(2, 9);

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname.includes('/webrtc-signaling')) {
    event.respondWith(handleWebRTCSignaling(event.request));
    return;
  }
  
  if (url.pathname.includes('/peer-connect')) {
    event.respondWith(handlePeerConnection(event.request));
    return;
  }
  
  if (url.pathname.includes('/role-manage')) {
    event.respondWith(handleRoleManagement(event.request));
    return;
  }
  
  if (url.pathname.includes('/verify-auth')) {
    event.respondWith(handleAuthVerification(event.request));
    return;
  }
});

async function handleWebRTCSignaling(request) {
  try {
    const data = await request.json();
    const { from, to, signal, token } = data;
    
    const sender = verifyToken(token);
    if (!sender) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
    }
    
    if (!hasPermission(sender.role, 'send')) {
      return new Response(JSON.stringify({ error: 'Permission denied' }), { status: 403 });
    }
    
    const receiver = peers.get(to);
    if (!receiver) {
      return new Response(JSON.stringify({ error: 'Receiver not found' }), { status: 404 });
    }
    
    const clients = await self.clients.matchAll();
    const client = clients.find(c => c.id === to);
    if (client) {
      client.postMessage({
        type: 'WEBRTC_SIGNAL',
        from: from,
        signal: signal
      });
    }
    
    logEvent('signaling', { from, to, timestamp: Date.now() });
    
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function handlePeerConnection(request) {
  try {
    const data = await request.json();
    const { peerId, token, action } = data;
    
    const requester = verifyToken(token);
    if (!requester && action !== 'register') {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
    }
    
    switch (action) {
      case 'register':
        const newRole = 'OBSERVER';
        const newToken = generateToken(peerId, newRole);
        peers.set(peerId, {
          id: peerId,
          role: newRole,
          token: newToken,
          connected: true,
          since: Date.now()
        });
        
        logEvent('peer_register', { peerId, timestamp: Date.now() });
        
        return new Response(JSON.stringify({ 
          success: true, 
          token: newToken,
          role: newRole
        }), { status: 200 });
      
      case 'connect':
        if (!requester || !hasPermission(requester.role, 'add_peers')) {
          return new Response(JSON.stringify({ error: 'Cannot add peers' }), { status: 403 });
        }
        
        const connectToken = generateToken(peerId, 'TRUSTEE');
        peers.set(peerId, {
          id: peerId,
          role: 'TRUSTEE',
          token: connectToken,
          connected: true,
          since: Date.now()
        });
        
        broadcastPeerList();
        
        return new Response(JSON.stringify({ 
          success: true, 
          token: connectToken,
          role: 'TRUSTEE'
        }), { status: 200 });
        
      case 'disconnect':
        if (requester) {
          peers.delete(peerId);
          broadcastPeerList();
          logEvent('peer_disconnect', { peerId, timestamp: Date.now() });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
        
      case 'list':
        const peerList = Array.from(peers.entries()).map(([id, info]) => ({
          id,
          role: info.role,
          connected: info.connected,
          since: info.since
        }));
        return new Response(JSON.stringify({ peers: peerList }), { status: 200 });
        
      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function handleRoleManagement(request) {
  try {
    const data = await request.json();
    const { targetId, newRole, token } = data;
    
    const requester = verifyToken(token);
    if (!requester) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
    }
    
    if (requester.role !== 'ADMIN') {
      return new Response(JSON.stringify({ error: 'Only admins can change roles' }), { status: 403 });
    }
    
    const target = peers.get(targetId);
    if (!target) {
      return new Response(JSON.stringify({ error: 'Peer not found' }), { status: 404 });
    }
    
    if (!ROLES[newRole]) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), { status: 400 });
    }
    
    target.role = newRole;
    const newToken = generateToken(targetId, newRole);
    target.token = newToken;
    
    const clients = await self.clients.matchAll();
    const client = clients.find(c => c.id === targetId);
    if (client) {
      client.postMessage({
        type: 'ROLE_CHANGE',
        newRole: newRole,
        newToken: newToken
      });
    }
    
    logEvent('role_change', { 
      changedBy: requester.id, 
      target: targetId, 
      newRole, 
      timestamp: Date.now() 
    });
    
    broadcastPeerList();
    
    return new Response(JSON.stringify({ 
      success: true, 
      newToken: newToken,
      role: newRole 
    }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function handleAuthVerification(request) {
  try {
    const data = await request.json();
    const { token } = data;
    
    const peer = verifyToken(token);
    if (!peer) {
      return new Response(JSON.stringify({ valid: false }), { status: 200 });
    }
    
    return new Response(JSON.stringify({ 
      valid: true, 
      role: peer.role,
      id: peer.id,
      permissions: ROLES[peer.role]?.can || []
    }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ valid: false }), { status: 200 });
  }
}

function verifyToken(token) {
  if (!token) return null;
  
  try {
    const [peerId, role, timestamp, signature] = token.split(':');
    
    if (Date.now() - parseInt(timestamp) > 24 * 60 * 60 * 1000) {
      return null;
    }
    
    const expectedSig = btoa(`${peerId}:${role}:${timestamp}:${SECRET_KEY}`);
    if (signature !== expectedSig) {
      return null;
    }
    
    return { id: peerId, role };
  } catch (e) {
    return null;
  }
}

function generateToken(peerId, role) {
  const timestamp = Date.now();
  const signature = btoa(`${peerId}:${role}:${timestamp}:${SECRET_KEY}`);
  return `${peerId}:${role}:${timestamp}:${signature}`;
}

function hasPermission(role, action) {
  return ROLES[role]?.can.includes(action) || false;
}

async function broadcastPeerList() {
  const peerList = Array.from(peers.entries()).map(([id, info]) => ({
    id,
    role: info.role,
    connected: info.connected,
    since: info.since
  }));
  
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'PEER_LIST_UPDATE',
      peers: peerList
    });
  });
}

function logEvent(type, data) {
  eventLog.push({ type, data, timestamp: Date.now() });
  if (eventLog.length > 1000) eventLog.shift();
}

self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'REGISTER_PEER':
      const { peerId, role } = data;
      const token = generateToken(peerId, role || 'OBSERVER');
      peers.set(peerId, {
        id: peerId,
        role: role || 'OBSERVER',
        token: token,
        connected: true,
        since: Date.now()
      });
      event.ports[0].postMessage({ token, success: true, role: role || 'OBSERVER' });
      broadcastPeerList();
      break;
      
    case 'AUTHENTICATE':
      const authToken = data.token;
      const peer = verifyToken(authToken);
      event.ports[0].postMessage({ 
        authenticated: !!peer,
        peer: peer
      });
      break;
      
    case 'GET_PEERS':
      event.ports[0].postMessage({
        peers: Array.from(peers.entries()).map(([id, info]) => ({
          id,
          role: info.role,
          connected: info.connected,
          since: info.since
        }))
      });
      break;
      
    case 'GET_LOG':
      event.ports[0].postMessage({ log: eventLog.slice(-100) });
      break;
  }
});
