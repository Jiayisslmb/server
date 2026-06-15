import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private key: Buffer;
  private legacyKeys: Buffer[] = [];
  private readonly keyFilePath: string;

  constructor(private configService: ConfigService) {
    this.keyFilePath = path.join(process.cwd(), 'encryption.key');
  }

  async onModuleInit() {
    this.key = await this.initializeKey();
    await this.loadLegacyKeys();
  }

  /**
   * 加载旧加密密钥，用于兼容解密历史消息
   * 来源：encryption.key 文件 + LEGACY_ENCRYPTION_KEY 环境变量
   */
  private async loadLegacyKeys(): Promise<void> {
    // 1. 从 encryption.key 文件加载（如果与当前密钥不同）
    try {
      if (fs.existsSync(this.keyFilePath)) {
        const savedKey = fs.readFileSync(this.keyFilePath, 'utf8').trim();
        const legacyKey = Buffer.from(savedKey, 'hex');
        if (legacyKey.length === 32 && !legacyKey.equals(this.key)) {
          this.legacyKeys.push(legacyKey);
          this.logger.log('已从文件加载旧加密密钥，用于兼容解密历史消息');
        }
      }
    } catch (err) {
      this.logger.warn(`加载旧密钥文件失败: ${err.message}`);
    }

    // 2. 从 LEGACY_ENCRYPTION_KEY 环境变量加载
    const envLegacyKey = this.configService.get<string>('LEGACY_ENCRYPTION_KEY');
    if (envLegacyKey) {
      try {
        const key = Buffer.from(envLegacyKey, 'hex');
        if (key.length === 32 && !key.equals(this.key) &&
            !this.legacyKeys.some(k => k.equals(key))) {
          this.legacyKeys.push(key);
          this.logger.log('已从环境变量加载旧加密密钥');
        }
      } catch (err) {
        this.logger.warn(`解析 LEGACY_ENCRYPTION_KEY 失败: ${err.message}`);
      }
    }

    if (this.legacyKeys.length > 0) {
      this.logger.log(`共加载 ${this.legacyKeys.length} 个旧加密密钥`);
    }
  }

  private async initializeKey(): Promise<Buffer> {
    const envKey = this.configService.get<string>('ENCRYPTION_KEY');
    
    if (envKey) {
      const key = Buffer.from(envKey, 'hex');
      if (key.length !== 32) {
        throw new Error('ENCRYPTION_KEY 必须是32字节（64个十六进制字符）');
      }
      this.logger.log('使用环境变量中的加密密钥');
      return key;
    }

    try {
      if (fs.existsSync(this.keyFilePath)) {
        const savedKey = fs.readFileSync(this.keyFilePath, 'utf8').trim();
        const key = Buffer.from(savedKey, 'hex');
        if (key.length === 32) {
          this.logger.log('从文件加载加密密钥');
          return key;
        }
      }
    } catch (err) {
      this.logger.warn(`读取密钥文件失败: ${err.message}`);
    }

    const newKey = crypto.randomBytes(32);
    try {
      fs.writeFileSync(this.keyFilePath, newKey.toString('hex'), { mode: 0o600 });
      this.logger.log('生成并保存新的加密密钥到文件');
    } catch (err) {
      this.logger.error(`保存密钥文件失败: ${err.message}`);
    }
    
    return newKey;
  }

  encrypt(plaintext: string): EncryptedData {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  decrypt(encryptedData: EncryptedData): string {
    return this.decryptWithKey(encryptedData, this.key);
  }

  /** 使用指定密钥解密（供双密钥兼容使用） */
  private decryptWithKey(encryptedData: EncryptedData, key: Buffer): string {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      key,
      Buffer.from(encryptedData.iv, 'hex'),
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  encryptObject<T>(obj: T): EncryptedData {
    return this.encrypt(JSON.stringify(obj));
  }

  decryptObject<T>(encryptedData: EncryptedData): T {
    const decrypted = this.decrypt(encryptedData);
    return JSON.parse(decrypted) as T;
  }

  encryptForStorage(data: string): string {
    const encrypted = this.encrypt(data);
    return JSON.stringify(encrypted);
  }

  decryptFromStorage(storedData: string): string {
    try {
      const encryptedData: EncryptedData = JSON.parse(storedData);
      if (encryptedData.encrypted && encryptedData.iv && encryptedData.authTag) {
        // 先尝试主密钥解密
        try {
          return this.decrypt(encryptedData);
        } catch (primaryError) {
          // 主密钥失败，尝试旧密钥
          for (const legacyKey of this.legacyKeys) {
            try {
              const result = this.decryptWithKey(encryptedData, legacyKey);
              this.logger.log('使用旧密钥成功解密一条历史消息');
              return result;
            } catch (legacyError) {
              continue;
            }
          }
          throw primaryError;
        }
      }
    } catch (error) {
    }
    return storedData;
  }

  hashPassword(password: string): string {
    return crypto
      .createHash('sha256')
      .update(password + this.key.toString('hex'))
      .digest('hex');
  }

  generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  deriveKeyFromPassword(password: string, salt?: string): { key: string; salt: string } {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const key = crypto
      .pbkdf2Sync(password, actualSalt, 100000, 32, 'sha512')
      .toString('hex');
    
    return { key, salt: actualSalt };
  }
}
