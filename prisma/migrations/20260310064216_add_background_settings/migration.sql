-- AlterTable
ALTER TABLE `User` ADD COLUMN `backgroundCid` VARCHAR(255) NULL;
ALTER TABLE `User` ADD COLUMN `backgroundColor` VARCHAR(7) DEFAULT '#f0f0f0';