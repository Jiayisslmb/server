-- AlterTable
ALTER TABLE `user` ADD COLUMN `adminDeviceBound` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `adminDeviceFingerprint` VARCHAR(255) NULL,
    ADD COLUMN `adminSessionToken` VARCHAR(255) NULL,
    ADD COLUMN `failedLoginAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lastAdminLogin` DATETIME(3) NULL,
    ADD COLUMN `lockedUntil` DATETIME(3) NULL,
    ADD COLUMN `mfaEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mfaSecret` VARCHAR(255) NULL;

-- CreateTable
CREATE TABLE `adminsession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `sessionToken` VARCHAR(255) NOT NULL,
    `deviceFingerprint` VARCHAR(255) NOT NULL,
    `ipAddress` VARCHAR(45) NULL,
    `userAgent` TEXT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `adminsession_sessionToken_key`(`sessionToken`),
    INDEX `AdminSession_userId_fkey`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `adminauditlog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `targetType` VARCHAR(50) NULL,
    `targetId` INTEGER NULL,
    `details` TEXT NULL,
    `ipAddress` VARCHAR(45) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminAuditLog_userId_fkey`(`userId`),
    INDEX `AdminAuditLog_action_idx`(`action`),
    INDEX `AdminAuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `User_adminDeviceFingerprint_idx` ON `user`(`adminDeviceFingerprint`);

-- AddForeignKey
ALTER TABLE `adminsession` ADD CONSTRAINT `AdminSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `adminauditlog` ADD CONSTRAINT `AdminAuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
