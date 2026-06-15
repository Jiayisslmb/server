import { Module } from '@nestjs/common';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { ChatGateway } from './chat.gateway';
import { PrismaService } from 'src/config/prisma.service';
import { RedisService } from 'src/config/redis.service';
import { EncryptionService } from 'src/common/services/encryption.service';
import { DeviceService } from 'src/common/services/device.service';
import { NotificationModule } from 'src/modules/notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [MessageController],
  providers: [MessageService, ChatGateway, PrismaService, RedisService, EncryptionService, DeviceService],
  exports: [MessageService, ChatGateway],
})
export class MessageModule {}
