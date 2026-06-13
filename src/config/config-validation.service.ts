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
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('JWT_SECRET 长度不足（至少32字符）。请使用 node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" 生成强随机密钥');
    }

    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey || encryptionKey.length < 32) {
      this.logger.warn('警告: ENCRYPTION_KEY 未配置或长度不足，加密功能可能不可用');
    }

    this.logger.log('环境变量验证通过');
  }
}
