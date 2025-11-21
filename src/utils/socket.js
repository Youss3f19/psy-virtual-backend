let io = null;
const socketsByUser = new Map(); // userId -> Set(socketId)

function initSocket(server) {
  try {
    const socketio = require('socket.io');
    io = socketio(server, { cors: { origin: '*' } });

    io.on('connection', (socket) => {
      const { userId } = socket.handshake.query || {};
      if (userId) {
        const s = socketsByUser.get(userId) || new Set();
        s.add(socket.id);
        socketsByUser.set(userId, s);
      }

      socket.on('disconnect', () => {
        if (userId) {
          const s = socketsByUser.get(userId);
          if (s) {
            s.delete(socket.id);
            if (s.size === 0) socketsByUser.delete(userId);
          }
        }
      });
    });
  } catch (e) {
    // socket.io not installed
    io = null;
  }
}

function emitToUser(userId, event, payload) {
  if (!io) return false;
  const s = socketsByUser.get(String(userId));
  if (!s || s.size === 0) return false;
  for (const sid of s) io.to(sid).emit(event, payload);
  return true;
}

module.exports = { initSocket, emitToUser, _internal: { socketsByUser } };
