-- CreateTable
CREATE TABLE `auth_logs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `branchId` INTEGER NOT NULL,
  `role` ENUM('OWNER', 'MANAGER', 'CASHIER') NOT NULL,
  `action` ENUM('LOGIN', 'LOGOUT') NOT NULL,
  `ipAddress` VARCHAR(45) NULL,
  `userAgent` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `auth_logs_userId_idx`(`userId`),
  INDEX `auth_logs_branchId_idx`(`branchId`),
  INDEX `auth_logs_createdAt_idx`(`createdAt`),
  INDEX `auth_logs_action_idx`(`action`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `auth_logs` ADD CONSTRAINT `auth_logs_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_logs` ADD CONSTRAINT `auth_logs_branchId_fkey`
  FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
