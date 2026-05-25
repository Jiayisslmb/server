import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { PrismaService } from 'src/config/prisma.service';
import { PrivacyService } from 'src/common/services/privacy.service';
import { RedisService } from 'src/config/redis.service';
import { AdminSecurityService } from 'src/common/services/admin-security.service';

@Module({
  controllers: [UserController],
  providers: [UserService, PrismaService, PrivacyService, RedisService, AdminSecurityService],
  exports: [UserService, PrivacyService],
})
export class UserModule {}
