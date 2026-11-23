-- AlterTable
ALTER TABLE `ingredients` ADD COLUMN `gramsPerUnit` DECIMAL(12, 3) NULL;

-- AlterTable
ALTER TABLE `inventory_transfers` ADD COLUMN `inputQuantity` DECIMAL(12, 3) NULL,
    ADD COLUMN `inputUnit` VARCHAR(50) NULL,
    ADD COLUMN `conversionFactor` DECIMAL(12, 3) NULL;
