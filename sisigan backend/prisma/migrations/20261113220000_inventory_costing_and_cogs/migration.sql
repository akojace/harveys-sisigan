-- AlterTable
ALTER TABLE `ingredients` ADD COLUMN `yieldPercentage` DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    MODIFY `unit` ENUM('KG', 'GRAM', 'LITER', 'ML', 'PCS', 'GALLON', 'TANK', 'BAG', 'PACK', 'TUB') NOT NULL,
    MODIFY `defaultPrice` DECIMAL(12, 4) NULL;

-- AlterTable
ALTER TABLE `inventory_audit_logs` ADD COLUMN `referenceNo` VARCHAR(100) NULL,
    ADD COLUMN `totalCost` DECIMAL(12, 2) NULL,
    ADD COLUMN `unitCost` DECIMAL(12, 4) NULL,
    MODIFY `actionType` ENUM('ORDER_DEDUCTION', 'ORDER_RESTORE', 'DAILY_DEDUCTION', 'MANUAL_EDIT', 'RESTOCK', 'WASTAGE') NOT NULL;

-- AlterTable
ALTER TABLE `inventory_items` MODIFY `price` DECIMAL(12, 4) NULL;

-- AlterTable
ALTER TABLE `menu_item_recipes` ADD COLUMN `unit` ENUM('KG', 'GRAM', 'LITER', 'ML', 'PCS', 'GALLON', 'TANK', 'BAG', 'PACK', 'TUB') NULL,
    ADD COLUMN `yieldFactor` DECIMAL(5, 2) NOT NULL DEFAULT 1.00;

-- AlterTable
ALTER TABLE `order_items` ADD COLUMN `cogs` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `unitCost` DECIMAL(12, 4) NOT NULL DEFAULT 0.0000;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `cogs` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `discountTotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `inventoryDeducted` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `expenses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `category` ENUM('RENT', 'UTILITIES', 'SALARIES', 'SUPPLIES', 'MAINTENANCE', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `amount` DECIMAL(10, 2) NOT NULL,
    `description` VARCHAR(255) NULL,
    `expenseDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actorUserId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `expenses_branchId_idx`(`branchId`),
    INDEX `expenses_category_idx`(`category`),
    INDEX `expenses_expenseDate_idx`(`expenseDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
