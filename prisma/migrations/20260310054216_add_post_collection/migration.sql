/*
  Warnings:

  - Added the required column `authorId` to the `PostComment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `postcomment` ADD COLUMN `authorId` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `PostCollection` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `postId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PostCollection_postId_userId_key`(`postId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PostCollection` ADD CONSTRAINT `PostCollection_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostCollection` ADD CONSTRAINT `PostCollection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostComment` ADD CONSTRAINT `PostComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
