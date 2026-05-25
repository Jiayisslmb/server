/*
  Warnings:

  - You are about to drop the column `postId` on the `notification` table. All the data in the column will be lost.
  - You are about to drop the `post` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `postcollection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `postcomment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `postlike` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `authorId` to the `articlecomment` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `post` DROP FOREIGN KEY `Post_authorId_fkey`;

-- DropForeignKey
ALTER TABLE `post` DROP FOREIGN KEY `Post_circleId_fkey`;

-- DropForeignKey
ALTER TABLE `postcollection` DROP FOREIGN KEY `PostCollection_postId_fkey`;

-- DropForeignKey
ALTER TABLE `postcollection` DROP FOREIGN KEY `PostCollection_userId_fkey`;

-- DropForeignKey
ALTER TABLE `postcomment` DROP FOREIGN KEY `PostComment_authorId_fkey`;

-- DropForeignKey
ALTER TABLE `postcomment` DROP FOREIGN KEY `PostComment_postId_fkey`;

-- DropForeignKey
ALTER TABLE `postcomment` DROP FOREIGN KEY `PostComment_replyToId_fkey`;

-- DropForeignKey
ALTER TABLE `postlike` DROP FOREIGN KEY `PostLike_postId_fkey`;

-- DropForeignKey
ALTER TABLE `postlike` DROP FOREIGN KEY `PostLike_userId_fkey`;

-- AlterTable
ALTER TABLE `article` ADD COLUMN `circleId` INTEGER NULL,
    ADD COLUMN `mediaCid` VARCHAR(255) NULL,
    ADD COLUMN `visibility` VARCHAR(20) NOT NULL DEFAULT 'public';

-- AlterTable
ALTER TABLE `articlecomment` ADD COLUMN `authorId` INTEGER NOT NULL,
    ADD COLUMN `replyToId` INTEGER NULL;

-- AlterTable
ALTER TABLE `notification` DROP COLUMN `postId`,
    ADD COLUMN `articleId` INTEGER NULL,
    ADD COLUMN `momentId` INTEGER NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `colorScheme` VARCHAR(10) NOT NULL DEFAULT 'light',
    ADD COLUMN `defaultVisibility` VARCHAR(20) NOT NULL DEFAULT 'public',
    ADD COLUMN `fontSize` VARCHAR(10) NOT NULL DEFAULT 'medium',
    ADD COLUMN `language` VARCHAR(10) NOT NULL DEFAULT 'zh-CN';

-- DropTable
DROP TABLE `post`;

-- DropTable
DROP TABLE `postcollection`;

-- DropTable
DROP TABLE `postcomment`;

-- DropTable
DROP TABLE `postlike`;

-- DropTable
DROP TABLE IF EXISTS `posttopic`;

-- CreateTable
CREATE TABLE `articlecollection` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `articleId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ArticleCollection_userId_fkey`(`userId`),
    UNIQUE INDEX `ArticleCollection_articleId_userId_key`(`articleId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `articletopic` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `articleId` INTEGER NOT NULL,
    `topicId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ArticleTopic_articleId_fkey`(`articleId`),
    INDEX `ArticleTopic_topicId_fkey`(`topicId`),
    UNIQUE INDEX `ArticleTopic_articleId_topicId_key`(`articleId`, `topicId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `content` TEXT NOT NULL,
    `mediaCid` VARCHAR(255) NULL,
    `visibility` VARCHAR(20) NOT NULL DEFAULT 'public',
    `authorId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Moment_authorId_fkey`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `momentcomment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `momentId` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `authorId` INTEGER NOT NULL,
    `replyToId` INTEGER NULL,

    INDEX `MomentComment_momentId_fkey`(`momentId`),
    INDEX `MomentComment_authorId_fkey`(`authorId`),
    INDEX `MomentComment_replyToId_fkey`(`replyToId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `momentlike` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `momentId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MomentLike_userId_fkey`(`userId`),
    UNIQUE INDEX `MomentLike_momentId_userId_key`(`momentId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `momentcollection` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `momentId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MomentCollection_userId_fkey`(`userId`),
    UNIQUE INDEX `MomentCollection_momentId_userId_key`(`momentId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `momenttopic` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `momentId` INTEGER NOT NULL,
    `topicId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MomentTopic_momentId_fkey`(`momentId`),
    INDEX `MomentTopic_topicId_fkey`(`topicId`),
    UNIQUE INDEX `MomentTopic_momentId_topicId_key`(`momentId`, `topicId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `topic` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `postCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `topic_name_key`(`name`),
    INDEX `Topic_name_idx`(`name`),
    INDEX `Topic_postCount_idx`(`postCount`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Article_circleId_fkey` ON `article`(`circleId`);

-- CreateIndex
CREATE INDEX `ArticleComment_authorId_fkey` ON `articlecomment`(`authorId`);

-- CreateIndex
CREATE INDEX `ArticleComment_replyToId_fkey` ON `articlecomment`(`replyToId`);

-- AddForeignKey
ALTER TABLE `article` ADD CONSTRAINT `Article_circleId_fkey` FOREIGN KEY (`circleId`) REFERENCES `circle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `articlecomment` ADD CONSTRAINT `ArticleComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `articlecomment` ADD CONSTRAINT `ArticleComment_replyToId_fkey` FOREIGN KEY (`replyToId`) REFERENCES `articlecomment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `articlecollection` ADD CONSTRAINT `ArticleCollection_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `articlecollection` ADD CONSTRAINT `ArticleCollection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `articletopic` ADD CONSTRAINT `ArticleTopic_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `articletopic` ADD CONSTRAINT `ArticleTopic_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topic`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moment` ADD CONSTRAINT `Moment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `momentcomment` ADD CONSTRAINT `MomentComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `momentcomment` ADD CONSTRAINT `MomentComment_momentId_fkey` FOREIGN KEY (`momentId`) REFERENCES `moment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `momentcomment` ADD CONSTRAINT `MomentComment_replyToId_fkey` FOREIGN KEY (`replyToId`) REFERENCES `momentcomment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `momentlike` ADD CONSTRAINT `MomentLike_momentId_fkey` FOREIGN KEY (`momentId`) REFERENCES `moment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `momentlike` ADD CONSTRAINT `MomentLike_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `momentcollection` ADD CONSTRAINT `MomentCollection_momentId_fkey` FOREIGN KEY (`momentId`) REFERENCES `moment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `momentcollection` ADD CONSTRAINT `MomentCollection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `momenttopic` ADD CONSTRAINT `MomentTopic_momentId_fkey` FOREIGN KEY (`momentId`) REFERENCES `moment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `momenttopic` ADD CONSTRAINT `MomentTopic_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topic`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
