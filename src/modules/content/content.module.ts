import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { PrismaService } from 'src/config/prisma.service';
import { AdminModule } from '../admin/admin.module';
import { NotificationModule } from '../notification/notification.module';
import { TopicsModule } from '../topics/topics.module';

@Module({
  imports: [AdminModule, NotificationModule, TopicsModule],
  controllers: [ContentController],
  providers: [ContentService, PrismaService],
  exports: [ContentService],
})
export class ContentModule {}
