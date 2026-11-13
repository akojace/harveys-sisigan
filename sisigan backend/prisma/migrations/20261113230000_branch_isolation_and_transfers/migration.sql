-- AlterTable
ALTER TABLE `inventory_audit_logs` MODIFY `actionType` ENUM('ORDER_DEDUCTION', 'ORDER_RESTORE', 'DAILY_DEDUCTION', 'MANUAL_EDIT', 'RESTOCK', 'WASTAGE', 'TRANSFER_OUT', 'TRANSFER_IN') NOT NULL;

-- CreateTable
CREATE TABLE `branch_menu_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `menuItemId` INTEGER NOT NULL,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `branch_menu_items_branchId_idx`(`branchId`),
    INDEX `branch_menu_items_menuItemId_idx`(`menuItemId`),
    UNIQUE INDEX `branch_menu_items_branchId_menuItemId_key`(`branchId`, `menuItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_transfers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transferNo` VARCHAR(50) NOT NULL,
    `sourceBranchId` INTEGER NOT NULL,
    `destBranchId` INTEGER NOT NULL,
    `ingredientId` INTEGER NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `unit` ENUM('KG', 'GRAM', 'LITER', 'ML', 'PCS', 'GALLON', 'TANK', 'BAG', 'PACK', 'TUB') NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'COMPLETED',
    `unitCost` DECIMAL(12, 4) NULL,
    `totalCost` DECIMAL(12, 2) NULL,
    `notes` VARCHAR(255) NULL,
    `actorUserId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inventory_transfers_transferNo_key`(`transferNo`),
    INDEX `inventory_transfers_sourceBranchId_idx`(`sourceBranchId`),
    INDEX `inventory_transfers_destBranchId_idx`(`destBranchId`),
    INDEX `inventory_transfers_ingredientId_idx`(`ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `branch_menu_items` ADD CONSTRAINT `branch_menu_items_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `branch_menu_items` ADD CONSTRAINT `branch_menu_items_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `menu_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transfers` ADD CONSTRAINT `inventory_transfers_sourceBranchId_fkey` FOREIGN KEY (`sourceBranchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transfers` ADD CONSTRAINT `inventory_transfers_destBranchId_fkey` FOREIGN KEY (`destBranchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transfers` ADD CONSTRAINT `inventory_transfers_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `ingredients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transfers` ADD CONSTRAINT `inventory_transfers_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
