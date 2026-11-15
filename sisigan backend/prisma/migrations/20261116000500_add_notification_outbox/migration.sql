-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `outboxEventId` VARCHAR(64) NULL;

-- CreateTable
CREATE TABLE `notification_outbox` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(64) NOT NULL,
    `idempotencyKey` VARCHAR(128) NOT NULL,
    `inventoryItemId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `targetState` ENUM('NORMAL', 'LOW_STOCK', 'OUT_OF_STOCK') NOT NULL,
    `eventType` ENUM('OUT_OF_STOCK', 'LOW_STOCK', 'RESTOCKED', 'ORDER_CREATED', 'ORDER_CANCELLED', 'SYSTEM') NOT NULL,
    `newQuantity` DECIMAL(12, 3) NOT NULL,
    `minThreshold` DECIMAL(12, 3) NOT NULL,
    `itemName` VARCHAR(150) NULL,
    `branchName` VARCHAR(100) NULL,
    `unit` ENUM('KG', 'GRAM', 'LITER', 'ML', 'PCS', 'GALLON', 'TANK', 'BAG', 'PACK', 'TUB') NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextRetryAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastError` VARCHAR(500) NULL,
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_outbox_eventId_key`(`eventId`),
    UNIQUE INDEX `notification_outbox_idempotencyKey_key`(`idempotencyKey`),
    INDEX `notification_outbox_status_nextRetryAt_createdAt_idx`(`status`, `nextRetryAt`, `createdAt`),
    INDEX `notification_outbox_inventoryItemId_status_idx`(`inventoryItemId`, `status`),
    INDEX `notification_outbox_branchId_idx`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `notifications_outboxEventId_userId_key` ON `notifications`(`outboxEventId`, `userId`);
