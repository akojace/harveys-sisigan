// server.js
// Entry point — starts Express + Socket.IO server

require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const app = require('./src/app');
const { initSocket } = require('./src/socket/orderSocket');
const { startInventoryDailyDeductionJob } = require('./src/jobs/inventory.cron');

const PORT = process.env.PORT || 3000;

// ── Create HTTP + WebSocket Server ───────────────────
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

// Pass io instance to Express (used in controllers)
app.set('io', io);

// Initialize socket event handlers
initSocket(io);
startInventoryDailyDeductionJob();

// ── Start Server ──────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log('\n🍖 ================================');
  console.log(`   Sisigan Restaurant POS API`);
  console.log('   ================================');
  console.log(`   HTTP:   http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Env:    ${process.env.NODE_ENV || 'development'}`);
  console.log('   ================================\n');
});
