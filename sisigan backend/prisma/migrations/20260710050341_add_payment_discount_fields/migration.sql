-- AlterTable
ALTER TABLE `payments` ADD COLUMN `discountAmount` DECIMAL(10, 2) NULL,
    ADD COLUMN `discountLabel` VARCHAR(50) NULL,
    ADD COLUMN `discountPercentage` DECIMAL(5, 2) NULL,
    ADD COLUMN `discountType` ENUM('SENIOR', 'PWD', 'STUDENT') NULL;
