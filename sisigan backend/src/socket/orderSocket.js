// src/socket/orderSocket.js
// Real-time events for kitchen display and order tracking

const jwt = require('jsonwebtoken');

function initSocket(io) {
  // Authenticate socket connections via JWT query param
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) return next(new Error('Authentication required.'));

    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token.'));
    }
  });

  io.on('connection', (socket) => {
    const { id, name, role, branchId } = socket.user;
    console.log(`🔌 Socket connected: ${name} (${role}) - Branch ${branchId}`);

    // Join branch-specific room for scoped broadcasts
    socket.join(`branch_${branchId}`);

    // OWNER joins all branches
    if (role === 'OWNER') socket.join('admin_room');

    // Kitchen display: subscribe to order events
    socket.on('join_kitchen', () => {
      socket.join(`kitchen_${branchId}`);
      console.log(`🍳 ${name} joined kitchen display for Branch ${branchId}`);
    });

    socket.on('disconnect', () => {
      console.log(`❌ Socket disconnected: ${name}`);
    });
  });

  return io;
}

module.exports = { initSocket };
