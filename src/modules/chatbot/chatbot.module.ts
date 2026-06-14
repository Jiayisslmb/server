import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { PrismaService } from '../../config/prisma.service';
import { RedisService } from '../../config/redis.service';

@Module({
  controllers: [ChatbotController],
  providers: [ChatbotService, PrismaService, RedisService],
})
export class ChatbotModule {}
