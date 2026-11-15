const notificationService = require('../modules/notifications/notification.service');

let workerTimer = null;
let isRunning = false;

/**
 * Run a single bounded outbox dispatch cycle with overlap protection and error isolation.
 * @param {object} [options]
 * @param {number} [options.batchSize=20]
 * @returns {Promise<{ claimed: number, sent: number, failed: number } | null>}
 */
async function runOutboxCycle({ batchSize = 20 } = {}) {
  if (isRunning) {
    return null;
  }

  isRunning = true;
  try {
    return await notificationService.dispatchPendingOutboxEvents({ batchSize });
  } catch (err) {
    console.error('[NotificationOutboxWorker] Dispatch cycle failed:', err.message);
    return null;
  } finally {
    isRunning = false;
  }
}

/**
 * Start the periodic notification outbox dispatcher and trigger an immediate startup sweep
 * so any events left pending before a restart or spindown are processed promptly.
 * @param {object} [options]
 * @param {number} [options.intervalMs=15000]
 * @param {number} [options.batchSize=20]
 */
function startNotificationOutboxWorker({ intervalMs = 15000, batchSize = 20 } = {}) {
  if (workerTimer) {
    return workerTimer;
  }

  // Immediate startup sweep for pending outbox events left prior to process start
  void runOutboxCycle({ batchSize });

  workerTimer = setInterval(() => {
    void runOutboxCycle({ batchSize });
  }, intervalMs);

  if (typeof workerTimer.unref === 'function') {
    workerTimer.unref();
  }

  console.log(`[NotificationOutboxWorker] Started (intervalMs=${intervalMs}, batchSize=${batchSize})`);
  return workerTimer;
}

/**
 * Stop the periodic notification outbox dispatcher cleanly during shutdown.
 */
function stopNotificationOutboxWorker() {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

module.exports = {
  runOutboxCycle,
  startNotificationOutboxWorker,
  stopNotificationOutboxWorker,
};
