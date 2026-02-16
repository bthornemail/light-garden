const WebSocket = require('ws');

const PORT = process.env.SIGNALING_PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const peers = new Map();
const rooms = new Map();

console.log(`Signaling server running on port ${PORT}`);

wss.on('connection', (ws) => {
  const peerId = `peer_${Date.now()}`;
  peers.set(ws, { id: peerId, room: null });
  
  console.log(`Peer connected: ${peerId}`);
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(ws, peerId, message);
    } catch (e) {
      console.error('Message parse error:', e);
    }
  });
  
  ws.on('close', () => {
    const peer = peers.get(ws);
    if (peer && peer.room) {
      const room = rooms.get(peer.room);
      if (room) {
        room.delete(peerId);
        broadcastToRoom(peer.room, {
          type: 'peer-list',
          peers: Array.from(room)
        }, peerId);
      }
    }
    peers.delete(ws);
    console.log(`Peer disconnected: ${peerId}`);
  });
  
  ws.send(JSON.stringify({
    type: 'welcome',
    peerId
  }));
});

function handleMessage(ws, peerId, message) {
  switch (message.type) {
    case 'join-room':
      handleJoinRoom(ws, peerId, message.room);
      break;
      
    case 'offer':
      forwardToPeer(message.to, {
        type: 'offer',
        offer: message.offer,
        from: peerId
      });
      break;
      
    case 'answer':
      forwardToPeer(message.to, {
        type: 'answer',
        answer: message.answer,
        from: peerId
      });
      break;
      
    case 'candidate':
      forwardToPeer(message.to, {
        type: 'candidate',
        candidate: message.candidate,
        from: peerId
      });
      break;
      
    case 'broadcast':
      const peer = peers.get(ws);
      if (peer && peer.room) {
        broadcastToRoom(peer.room, message, peerId);
      }
      break;
      
    default:
      console.log('Unknown message type:', message.type);
  }
}

function handleJoinRoom(ws, peerId, roomName) {
  const peer = peers.get(ws);
  if (!peer) return;
  
  if (peer.room) {
    const oldRoom = rooms.get(peer.room);
    if (oldRoom) {
      oldRoom.delete(peerId);
      broadcastToRoom(peer.room, {
        type: 'peer-list',
        peers: Array.from(oldRoom)
      }, peerId);
    }
  }
  
  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Set());
  }
  
  const room = rooms.get(roomName);
  room.add(peerId);
  peer.room = roomName;
  
  console.log(`Peer ${peerId} joined room ${roomName}`);
  
  ws.send(JSON.stringify({
    type: 'room-joined',
    room: roomName,
    peers: Array.from(room)
  }));
  
  broadcastToRoom(roomName, {
    type: 'peer-list',
    peers: Array.from(room)
  }, peerId);
}

function broadcastToRoom(roomName, message, excludePeer = null) {
  const room = rooms.get(roomName);
  if (!room) return;
  
  const msg = JSON.stringify(message);
  
  peers.forEach((peer, ws) => {
    if (peer.room === roomName && peer.id !== excludePeer && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

function forwardToPeer(targetPeerId, message) {
  peers.forEach((peer, ws) => {
    if (peer.id === targetPeerId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

process.on('SIGINT', () => {
  console.log('\nShutting down signaling server...');
  wss.close(() => {
    process.exit(0);
  });
});
