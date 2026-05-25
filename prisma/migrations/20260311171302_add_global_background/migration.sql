-- AlterTable
ALTER TABLE `user` ADD COLUMN `globalBackgroundCid` VARCHAR(255) NULL,
    ADD COLUMN `globalBackgroundColor` VARCHAR(7) NOT NULL DEFAULT '#ffffff';
