/*
  Warnings:

  - Made the column `backgroundColor` on table `user` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `user` MODIFY `backgroundColor` VARCHAR(7) NOT NULL DEFAULT '#f0f0f0';
