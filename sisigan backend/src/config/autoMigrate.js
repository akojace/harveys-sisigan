// src/config/autoMigrate.js
// Automatic database schema synchronization and migration runner.
// Ensures additive Prisma migrations (such as alertState and notification_outbox)
// are applied reliably in production environments like Render.

const { execSync } = require('child_process');
const crypto = require('crypto');

/**
 * Runs pending Prisma migrations using Prisma CLI, with a robust programmatic
 * fallback for additive DDL changes.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function autoMigrate(prisma) {
  console.log('[AutoMigrate] Checking production database migration status...');

  // 1. Attempt standard Prisma CLI migrate deploy
  let cliSuccess = false;
  try {
    const stdout = execSync('npx prisma migrate deploy', {
      encoding: 'utf-8',
      env: process.env,
      timeout: 30000,
    });
    console.log('[AutoMigrate] Prisma CLI output:\n' + stdout.trim());
    cliSuccess = true;
  } catch (err) {
    console.warn('[AutoMigrate] Prisma CLI deploy warning (will use programmatic verification):', err.message);
  }

  // 2. Programmatic schema verification and additive fallback
  try {
    // Check alertState column on inventory_items
    const alertCols = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = DATABASE() 
         AND table_name = 'inventory_items' 
         AND column_name = 'alertState'`
    );

    if (!Array.isArray(alertCols) || alertCols.length === 0) {
      console.log('[AutoMigrate] Adding missing inventory_items.alertState column...');
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`inventory_items\` 
         ADD COLUMN \`alertState\` ENUM('NORMAL', 'LOW_STOCK', 'OUT_OF_STOCK') NOT NULL DEFAULT 'NORMAL'`
      );
      console.log('✅ [AutoMigrate] Added inventory_items.alertState');
    }

    // Check notifications table
    const notifTables = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = DATABASE() 
         AND table_name = 'notifications'`
    );

    if (!Array.isArray(notifTables) || notifTables.length === 0) {
      console.log('[AutoMigrate] Creating notifications table...');
      await prisma.$executeRawUnsafe(
        `CREATE TABLE \`notifications\` (
            \`id\` INTEGER NOT NULL AUTO_INCREMENT,
            \`userId\` INTEGER NOT NULL,
            \`branchId\` INTEGER NULL,
            \`inventoryItemId\` INTEGER NULL,
            \`orderId\` INTEGER NULL,
            \`type\` ENUM('OUT_OF_STOCK', 'LOW_STOCK', 'RESTOCKED', 'ORDER_CREATED', 'ORDER_CANCELLED', 'SYSTEM') NOT NULL,
            \`severity\` ENUM('CRITICAL', 'WARNING', 'INFO', 'RECOVERY') NOT NULL,
            \`title\` VARCHAR(150) NOT NULL,
            \`message\` VARCHAR(500) NOT NULL,
            \`itemName\` VARCHAR(150) NULL,
            \`branchName\` VARCHAR(100) NULL,
            \`currentQty\` DECIMAL(12, 3) NULL,
            \`minThreshold\` DECIMAL(12, 3) NULL,
            \`unit\` ENUM('KG', 'GRAM', 'LITER', 'ML', 'PCS', 'GALLON', 'TANK', 'BAG', 'PACK', 'TUB') NULL,
            \`actionUrl\` VARCHAR(255) NULL,
            \`isRead\` BOOLEAN NOT NULL DEFAULT false,
            \`readAt\` DATETIME(3) NULL,
            \`isResolved\` BOOLEAN NOT NULL DEFAULT false,
            \`resolvedAt\` DATETIME(3) NULL,
            \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            \`outboxEventId\` VARCHAR(64) NULL,

            INDEX \`notifications_userId_isRead_createdAt_idx\`(\`userId\`, \`isRead\`, \`createdAt\`),
            INDEX \`notifications_userId_createdAt_idx\`(\`userId\`, \`createdAt\`),
            INDEX \`notifications_branchId_type_isResolved_idx\`(\`branchId\`, \`type\`, \`isResolved\`),
            INDEX \`notifications_inventoryItemId_type_isResolved_idx\`(\`inventoryItemId\`, \`type\`, \`isResolved\`),
            PRIMARY KEY (\`id\`),
            CONSTRAINT \`notifications_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT \`notifications_branchId_fkey\` FOREIGN KEY (\`branchId\`) REFERENCES \`branches\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT \`notifications_inventoryItemId_fkey\` FOREIGN KEY (\`inventoryItemId\`) REFERENCES \`inventory_items\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      console.log('✅ [AutoMigrate] Created notifications table');
    }

    // Check notifications.outboxEventId column
    const outboxCols = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = DATABASE() 
         AND table_name = 'notifications' 
         AND column_name = 'outboxEventId'`
    );

    if (!Array.isArray(outboxCols) || outboxCols.length === 0) {
      console.log('[AutoMigrate] Adding notifications.outboxEventId column...');
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`notifications\` ADD COLUMN \`outboxEventId\` VARCHAR(64) NULL`
      );
      try {
        await prisma.$executeRawUnsafe(
          `CREATE UNIQUE INDEX \`notifications_outboxEventId_userId_key\` ON \`notifications\`(\`outboxEventId\`, \`userId\`)`
        );
      } catch (idxErr) {
        // Index may already exist
      }
      console.log('✅ [AutoMigrate] Added notifications.outboxEventId');
    }

    // Check notification_outbox table
    const outboxTables = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = DATABASE() 
         AND table_name = 'notification_outbox'`
    );

    if (!Array.isArray(outboxTables) || outboxTables.length === 0) {
      console.log('[AutoMigrate] Creating notification_outbox table...');
      await prisma.$executeRawUnsafe(
        `CREATE TABLE \`notification_outbox\` (
            \`id\` INTEGER NOT NULL AUTO_INCREMENT,
            \`eventId\` VARCHAR(64) NOT NULL,
            \`idempotencyKey\` VARCHAR(128) NOT NULL,
            \`inventoryItemId\` INTEGER NOT NULL,
            \`branchId\` INTEGER NOT NULL,
            \`targetState\` ENUM('NORMAL', 'LOW_STOCK', 'OUT_OF_STOCK') NOT NULL,
            \`eventType\` ENUM('OUT_OF_STOCK', 'LOW_STOCK', 'RESTOCKED', 'ORDER_CREATED', 'ORDER_CANCELLED', 'SYSTEM') NOT NULL,
            \`newQuantity\` DECIMAL(12, 3) NOT NULL,
            \`minThreshold\` DECIMAL(12, 3) NOT NULL,
            \`itemName\` VARCHAR(150) NULL,
            \`branchName\` VARCHAR(100) NULL,
            \`unit\` ENUM('KG', 'GRAM', 'LITER', 'ML', 'PCS', 'GALLON', 'TANK', 'BAG', 'PACK', 'TUB') NULL,
            \`status\` ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
            \`attempts\` INTEGER NOT NULL DEFAULT 0,
            \`nextRetryAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            \`lastError\` VARCHAR(500) NULL,
            \`processedAt\` DATETIME(3) NULL,
            \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            \`updatedAt\` DATETIME(3) NOT NULL,

            UNIQUE INDEX \`notification_outbox_eventId_key\`(\`eventId\`),
            UNIQUE INDEX \`notification_outbox_idempotencyKey_key\`(\`idempotencyKey\`),
            INDEX \`notification_outbox_status_nextRetryAt_createdAt_idx\`(\`status\`, \`nextRetryAt\`, \`createdAt\`),
            INDEX \`notification_outbox_inventoryItemId_status_idx\`(\`inventoryItemId\`, \`status\`),
            INDEX \`notification_outbox_branchId_idx\`(\`branchId\`),
            PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      console.log('✅ [AutoMigrate] Created notification_outbox table');
    }

    // Check and record in _prisma_migrations table
    const migrationCheck = await prisma.$queryRawUnsafe(
      `SELECT migration_name FROM _prisma_migrations 
       WHERE migration_name IN (
         '20261115235500_add_notifications_and_alert_state',
         '20261116000500_add_notification_outbox'
       )`
    );

    const existingMigrations = new Set(
      (Array.isArray(migrationCheck) ? migrationCheck : []).map((m) => m.migration_name)
    );

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (!existingMigrations.has('20261115235500_add_notifications_and_alert_state')) {
      const id1 = crypto.randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO \`_prisma_migrations\` (\`id\`, \`checksum\`, \`finished_at\`, \`migration_name\`, \`logs\`, \`started_at\`, \`applied_steps_count\`)
         VALUES ('${id1}', '7d8966e9345479097cf3c47afa8291e0a4d3a61f8f1f6c0041615411fc895a01', '${now}', '20261115235500_add_notifications_and_alert_state', NULL, '${now}', 1)`
      );
      console.log('✅ [AutoMigrate] Recorded migration 20261115235500_add_notifications_and_alert_state in _prisma_migrations');
    }

    if (!existingMigrations.has('20261116000500_add_notification_outbox')) {
      const id2 = crypto.randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO \`_prisma_migrations\` (\`id\`, \`checksum\`, \`finished_at\`, \`migration_name\`, \`logs\`, \`started_at\`, \`applied_steps_count\`)
         VALUES ('${id2}', 'fd6b0e8b4110b796ef3748d08d8261d7697d1663713fdbef3a746290a2cf4c69', '${now}', '20261116000500_add_notification_outbox', NULL, '${now}', 1)`
      );
      console.log('✅ [AutoMigrate] Recorded migration 20261116000500_add_notification_outbox in _prisma_migrations');
    }

    console.log('✅ [AutoMigrate] Database schema verified and up to date.');
  } catch (err) {
    console.error('❌ [AutoMigrate] Error during schema verification:', err.message);
  }
}

module.exports = { autoMigrate };
