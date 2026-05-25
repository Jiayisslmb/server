import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('系统')
@Controller()
export class AppController {
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
  healthCheck(): {
    status: string;
    timestamp: string;
    uptime: number;
  } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
