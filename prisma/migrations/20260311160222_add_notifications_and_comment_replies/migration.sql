-- AlterTable
ALTER TABLE `postcomment` ADD COLUMN `replyToId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(20) NOT NULL,
    `userId` INTEGER NOT NULL,
    `fromUserId` INTEGER NULL,
    `postId` INTEGER NULL,
    `commentId` INTEGER NULL,
    `content` TEXT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_isRead_idx`(`userId`, `isRead`),
    INDEX `Notification_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PostComment` ADD CONSTRAINT `PostComment_replyToId_fkey` FOREIGN KEY (`replyToId`) REFERENCES `PostComment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
