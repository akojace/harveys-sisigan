// src/jobs/inventory.cron.js
// Runs automated daily inventory deduction at 6:00 AM.

const cron = require('node-cron');
const inventoryService = require('../modules/inventory/inventory.service');

function startInventoryDailyDeductionJob() {
  // Cron format: minute hour day-of-month month day-of-week
  // 0 6 * * * = 6:00 AM every day
  cron.schedule('0 6 * * *', async () => {
    try {
      const result = await inventoryService.runDailyDeduction();
      console.log(`[InventoryCron] 6AM daily deduction done. Processed=${result.processed}, skipped=${result.skipped}`);
    } catch (err) {
      console.error('[InventoryCron] Daily deduction failed:', err);
    }
  });

  console.log('[InventoryCron] Scheduled daily deduction at 6:00 AM');
}

module.exports = { startInventoryDailyDeductionJob };
