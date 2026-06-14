-- AlterTable
ALTER TABLE `user` ADD COLUMN `website` VARCHAR(255) NULL,
    ADD COLUMN `location` VARCHAR(100) NULL,
    ADD COLUMN `notificationPreferences` TEXT NULL;
