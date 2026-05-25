import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './config/prisma.service';
import { RedisService } from './config/redis.service';

@ApiTags('系统')
@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: '根路由' })
  getHello(): { message: string; timestamp: string } {
    return {
      message: '去中心化社交平台 API',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  async healthCheck(): Promise<{
    status: string;
    timestamp: string;
    uptime: number;
    database: string;
    redis: string;
  }> {
    let dbStatus = 'error';
    let redisStatus = 'error';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'ok';
    } catch {}

    try {
      if (this.redis.isReady()) {
        redisStatus = 'ok';
      } else {
        await this.redis.get('health-check');
        redisStatus = 'ok';
      }
    } catch {}

    const allOk = dbStatus === 'ok' && redisStatus === 'ok';

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      redis: redisStatus,
    };
  }
}
