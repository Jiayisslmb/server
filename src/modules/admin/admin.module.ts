import { Module, Global } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from 'src/config/prisma.service';
import { AdminSecurityService } from 'src/common/services/admin-security.service';

@Global()
@Module({
  controllers: [AdminController],
  providers: [AdminService, PrismaService, AdminSecurityService],
  exports: [AdminService],
})
export class AdminModule {}
