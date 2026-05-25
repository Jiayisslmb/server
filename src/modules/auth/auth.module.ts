import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from '../user/user.module';
import { RedisService } from 'src/config/redis.service';
import { AdminSecurityService } from 'src/common/services/admin-security.service';
import { PrismaService } from 'src/config/prisma.service';

@Module({
  imports: [
    UserModule,
    ConfigModule,
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '2h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RedisService, AdminSecurityService, PrismaService],
  exports: [AuthService],
})
export class AuthModule {}
