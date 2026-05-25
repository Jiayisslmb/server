import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from './config/prisma.service';
import { RedisModule } from './config/redis.module';
import { IpfsModule } from './common/ipfs.module';
import { DataStorageService } from './common/utils/data-storage.service';
import { ConfigValidationService } from './config/config-validation.service';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ContentModule } from './modules/content/content.module';
import { CircleModule } from './modules/circle/circle.module';
import { MessageModule } from './modules/message/message.module';
import { AdminModule } from './modules/admin/admin.module';
import { TopicsModule } from './modules/topics/topics.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ChatbotModule } from './modules/chatbot/chatbot.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local', '.env.development'],
    }),
    JwtModule.registerAsync({
      global: true,
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 100,
        },
      ],
    }),
    RedisModule,
    IpfsModule,
    AuthModule,
    UserModule,
    ContentModule,
    CircleModule,
    MessageModule,
    AdminModule,
    TopicsModule,
    NotificationModule,
    ChatbotModule,
  ],
  controllers: [AppController],
  providers: [
    PrismaService,
    DataStorageService,
    ConfigValidationService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [DataStorageService],
})
export class AppModule {}
