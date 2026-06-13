-- AlterTable
ALTER TABLE `user` ADD COLUMN `githubId` VARCHAR(50) NULL,
ADD COLUMN `avatarUrl` VARCHAR(500) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_githubId_key` ON `user`(`githubId`);

-- CreateIndex
CREATE INDEX `User_githubId_idx` ON `user`(`githubId`);
