-- AlterTable: add per-order tax breakdown fields
ALTER TABLE `orders` ADD COLUMN `vatableSales` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `vatAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `taxRate` DECIMAL(5, 2) NOT NULL DEFAULT 12.00;

-- Backfill tax breakdown for existing orders (VAT-inclusive @ 12%, matches totalAmount)
UPDATE `orders`
SET `vatAmount` = ROUND(`totalAmount` * 12 / 112, 2),
    `vatableSales` = `totalAmount` - ROUND(`totalAmount` * 12 / 112, 2),
    `taxRate` = 12.00;

-- DropForeignKey (needed before dropping the unique index it depends on)
ALTER TABLE `payments` DROP FOREIGN KEY `payments_orderId_fkey`;

-- DropIndex: remove the 1-to-1 constraint so an order can have multiple payment rows
DROP INDEX `payments_orderId_key` ON `payments`;

-- CreateIndex: plain (non-unique) index to keep orderId lookups fast
CREATE INDEX `payments_orderId_idx` ON `payments`(`orderId`);

-- AddForeignKey (re-added, now allowing multiple payments per order)
ALTER TABLE `payments` ADD CONSTRAINT `payments_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
