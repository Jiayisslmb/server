-- CreateTable
CREATE TABLE `momentrepost` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `momentId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MomentRepost_momentId_fkey`(`momentId`),
    INDEX `MomentRepost_userId_fkey`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `articlerepost` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `articleId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ArticleRepost_articleId_fkey`(`articleId`),
    INDEX `ArticleRepost_userId_fkey`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `AdminSession_sessionToken_key` ON `adminsession`(`sessionToken`);

-- AddForeignKey
ALTER TABLE `momentrepost` ADD CONSTRAINT `MomentRepost_momentId_fkey` FOREIGN KEY (`momentId`) REFERENCES `moment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `momentrepost` ADD CONSTRAINT `MomentRepost_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `articlerepost` ADD CONSTRAINT `ArticleRepost_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `articlerepost` ADD CONSTRAINT `ArticleRepost_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
