-- CreateTable
CREATE TABLE `ingredients` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `category` ENUM('SAUCE', 'SPICES', 'MAIN_INGREDIENT', 'RICE', 'UTILITIES', 'GAS') NOT NULL,
  `unit` ENUM('ML', 'GRAM', 'LITER', 'PCS', 'GALLON', 'TANK', 'BAG', 'PACK', 'TUB') NOT NULL,
  `defaultConsumptionRateDays` INTEGER NULL,
  `defaultConsumptionLabel` VARCHAR(100) NULL,
  `defaultDailyDeduction` DECIMAL(12, 3) NULL,
  `defaultPrice` DECIMAL(10, 2) NULL,
  `defaultMinThreshold` DECIMAL(12, 3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ingredients_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `ingredientId` INTEGER NOT NULL,
  `branchId` INTEGER NOT NULL,
  `quantity` DECIMAL(12, 3) NOT NULL,
  `minThreshold` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `price` DECIMAL(10, 2) NULL,
  `consumptionRateDays` INTEGER NULL,
  `consumptionLabel` VARCHAR(100) NULL,
  `dailyDeductionAmount` DECIMAL(12, 3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `inventory_items_branchId_idx`(`branchId`),
  INDEX `inventory_items_ingredientId_idx`(`ingredientId`),
  INDEX `inventory_items_isActive_idx`(`isActive`),
  UNIQUE INDEX `inventory_items_branchId_ingredientId_key`(`branchId`, `ingredientId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `menu_item_recipes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `menuItemId` INTEGER NOT NULL,
  `ingredientId` INTEGER NOT NULL,
  `quantity` DECIMAL(12, 3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `menu_item_recipes_ingredientId_idx`(`ingredientId`),
  UNIQUE INDEX `menu_item_recipes_menuItemId_ingredientId_key`(`menuItemId`, `ingredientId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_audit_logs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `inventoryItemId` INTEGER NOT NULL,
  `actionType` ENUM('ORDER_DEDUCTION', 'DAILY_DEDUCTION', 'MANUAL_EDIT') NOT NULL,
  `quantityBefore` DECIMAL(12, 3) NOT NULL,
  `quantityAfter` DECIMAL(12, 3) NOT NULL,
  `quantityChanged` DECIMAL(12, 3) NOT NULL,
  `note` VARCHAR(255) NULL,
  `orderId` INTEGER NULL,
  `actorUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `inventory_audit_logs_inventoryItemId_idx`(`inventoryItemId`),
  INDEX `inventory_audit_logs_actionType_idx`(`actionType`),
  INDEX `inventory_audit_logs_createdAt_idx`(`createdAt`),
  INDEX `inventory_audit_logs_orderId_idx`(`orderId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_ingredientId_fkey`
  FOREIGN KEY (`ingredientId`) REFERENCES `ingredients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_branchId_fkey`
  FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_item_recipes` ADD CONSTRAINT `menu_item_recipes_menuItemId_fkey`
  FOREIGN KEY (`menuItemId`) REFERENCES `menu_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_item_recipes` ADD CONSTRAINT `menu_item_recipes_ingredientId_fkey`
  FOREIGN KEY (`ingredientId`) REFERENCES `ingredients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_audit_logs` ADD CONSTRAINT `inventory_audit_logs_inventoryItemId_fkey`
  FOREIGN KEY (`inventoryItemId`) REFERENCES `inventory_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_audit_logs` ADD CONSTRAINT `inventory_audit_logs_orderId_fkey`
  FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_audit_logs` ADD CONSTRAINT `inventory_audit_logs_actorUserId_fkey`
  FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
