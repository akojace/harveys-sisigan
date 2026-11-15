-- AlterTable
ALTER TABLE `inventory_items` ADD COLUMN `alertState` ENUM('NORMAL', 'LOW_STOCK', 'OUT_OF_STOCK') NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `branchId` INTEGER NULL,
    `inventoryItemId` INTEGER NULL,
    `orderId` INTEGER NULL,
    `type` ENUM('OUT_OF_STOCK', 'LOW_STOCK', 'RESTOCKED', 'ORDER_CREATED', 'ORDER_CANCELLED', 'SYSTEM') NOT NULL,
    `severity` ENUM('CRITICAL', 'WARNING', 'INFO', 'RECOVERY') NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `itemName` VARCHAR(150) NULL,
    `branchName` VARCHAR(100) NULL,
    `currentQty` DECIMAL(12, 3) NULL,
    `minThreshold` DECIMAL(12, 3) NULL,
    `unit` ENUM('KG', 'GRAM', 'LITER', 'ML', 'PCS', 'GALLON', 'TANK', 'BAG', 'PACK', 'TUB') NULL,
    `actionUrl` VARCHAR(255) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `readAt` DATETIME(3) NULL,
    `isResolved` BOOLEAN NOT NULL DEFAULT false,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_isRead_createdAt_idx`(`userId`, `isRead`, `createdAt`),
    INDEX `notifications_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `notifications_branchId_type_isResolved_idx`(`branchId`, `type`, `isResolved`),
    INDEX `notifications_inventoryItemId_type_isResolved_idx`(`inventoryItemId`, `type`, `isResolved`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_inventoryItemId_fkey` FOREIGN KEY (`inventoryItemId`) REFERENCES `inventory_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
