import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConfigValidationService implements OnModuleInit {
  private readonly logger = new Logger(ConfigValidationService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const requiredEnvVars = [
      'DATABASE_URL',
      'JWT_SECRET',
      'REDIS_URL',
    ];

    const missingVars: string[] = [];

    for (const envVar of requiredEnvVars) {
      const value = this.configService.get<string>(envVar);
      if (!value) {
        missingVars.push(envVar);
      }
    }

    if (missingVars.length > 0) {
      this.logger.error('========================================');
      this.logger.error('缺少必需的环境变量:');
      missingVars.forEach(varName => {
        this.logger.error(`  - ${varName}`);
      });
      this.logger.error('请在 .env 文件中配置这些环境变量');
      this.logger.error('========================================');
      throw new Error(`缺少必需的环境变量: ${missingVars.join(', ')}`);
    }

    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (jwtSecret && (jwtSecret === 'your-secret-key' || jwtSecret.length < 32)) {
      this.logger.warn('警告: JWT_SECRET 应该是一个至少32字符的随机字符串');
    }

    this.logger.log('环境变量验证通过');
  }
}
