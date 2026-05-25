/*
  Warnings:

  - You are about to drop the column `contentId` on the `report` table. All the data in the column will be lost.
  - You are about to drop the column `contentType` on the `report` table. All the data in the column will be lost.
  - Added the required column `targetId` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Report` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `report` DROP COLUMN `contentId`,
    DROP COLUMN `contentType`,
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `targetId` INTEGER NOT NULL,
    ADD COLUMN `type` VARCHAR(20) NOT NULL,
    MODIFY `reason` VARCHAR(100) NOT NULL;
