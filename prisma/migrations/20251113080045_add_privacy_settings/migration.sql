-- AlterTable
ALTER TABLE `user` ADD COLUMN `allowFollow` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `allowMessage` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `hideFollowers` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hideFollowing` BOOLEAN NOT NULL DEFAULT false;
