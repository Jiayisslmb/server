import { Module } from '@nestjs/common';
import { CircleController } from './circle.controller';
import { CircleService } from './circle.service';
import { PrismaService } from 'src/config/prisma.service';

@Module({
  controllers: [CircleController],
  providers: [CircleService, PrismaService],
  exports: [CircleService],
})
export class CircleModule {}
