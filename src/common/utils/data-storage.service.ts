import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../config/redis.service';
import { IpfsService } from './ipfs.service';
import { PrismaService } from '../../config/prisma.service';

export enum StorageType {
  IPFS = 'ipfs',
  MYSQL = 'mysql',
  REDIS = 'redis',
  LOCAL = 'local',
}

export enum DataType {
  USER_AVATAR = 'user_avatar',
  USER_BACKGROUND = 'user_background',
  USER_PROFILE = 'user_profile',
  POST_CONTENT = 'post_content',
  POST_MEDIA = 'post_media',
  ARTICLE_CONTENT = 'article_content',
  ARTICLE_COVER = 'article_cover',
  MESSAGE_CONTENT = 'message_content',
  MESSAGE_MEDIA = 'message_media',
  CIRCLE_AVATAR = 'circle_avatar',
  CIRCLE_INFO = 'circle_info',
  SESSION_DATA = 'session_data',
  ONLINE_STATUS = 'online_status',
  HOT_POSTS = 'hot_posts',
  NOTIFICATION = 'notification',
}

interface StoragePolicy {
  primary: StorageType;
  cache?: StorageType;
  ttl?: number;
  decentralized?: boolean;
  persistent?: boolean;
}

@Injectable()
export class DataStorageService {
  private readonly logger = new Logger(DataStorageService.name);
  
  private readonly storagePolicies: Map<DataType, StoragePolicy> = new Map([
    [DataType.USER_AVATAR, { primary: StorageType.IPFS, cache: StorageType.REDIS, ttl: 86400, decentralized: true, persistent: true }],
    [DataType.USER_BACKGROUND, { primary: StorageType.IPFS, cache: StorageType.REDIS, ttl: 86400, decentralized: true, persistent: true }],
    [DataType.USER_PROFILE, { primary: StorageType.MYSQL, cache: StorageType.REDIS, ttl: 3600, decentralized: false, persistent: true }],
    [DataType.POST_CONTENT, { primary: StorageType.MYSQL, cache: StorageType.REDIS, ttl: 300, decentralized: false, persistent: true }],
    [DataType.POST_MEDIA, { primary: StorageType.IPFS, cache: StorageType.REDIS, ttl: 3600, decentralized: true, persistent: true }],
    [DataType.ARTICLE_CONTENT, { primary: StorageType.MYSQL, decentralized: false, persistent: true }],
    [DataType.ARTICLE_COVER, { primary: StorageType.IPFS, cache: StorageType.REDIS, ttl: 86400, decentralized: true, persistent: true }],
    [DataType.MESSAGE_CONTENT, { primary: StorageType.MYSQL, cache: StorageType.REDIS, ttl: 3600, decentralized: false, persistent: true }],
    [DataType.MESSAGE_MEDIA, { primary: StorageType.IPFS, decentralized: true, persistent: true }],
    [DataType.CIRCLE_AVATAR, { primary: StorageType.IPFS, cache: StorageType.REDIS, ttl: 86400, decentralized: true, persistent: true }],
    [DataType.CIRCLE_INFO, { primary: StorageType.MYSQL, cache: StorageType.REDIS, ttl: 600, decentralized: false, persistent: true }],
    [DataType.SESSION_DATA, { primary: StorageType.REDIS, ttl: 604800, decentralized: false, persistent: false }],
    [DataType.ONLINE_STATUS, { primary: StorageType.REDIS, ttl: 86400, decentralized: false, persistent: false }],
    [DataType.HOT_POSTS, { primary: StorageType.REDIS, ttl: 300, decentralized: false, persistent: false }],
    [DataType.NOTIFICATION, { primary: StorageType.REDIS, ttl: 86400, decentralized: false, persistent: false }],
  ]);

  constructor(
    private configService: ConfigService,
    private redis: RedisService,
    private ipfs: IpfsService,
    private prisma: PrismaService,
  ) {}

  getStoragePolicy(dataType: DataType): StoragePolicy {
    return this.storagePolicies.get(dataType) || { primary: StorageType.MYSQL };
  }

  async store(dataType: DataType, data: any, options?: { userId?: number; ttl?: number }): Promise<string | null> {
    const policy = this.getStoragePolicy(dataType);
    let primaryId: string | null = null;

    switch (policy.primary) {
      case StorageType.IPFS:
        primaryId = await this.storeToIPFS(data, dataType);
        break;
      case StorageType.MYSQL:
        primaryId = await this.storeToMySQL(dataType, data, options?.userId);
        break;
      case StorageType.REDIS:
        primaryId = await this.storeToRedis(data, options?.ttl || policy.ttl);
        break;
      case StorageType.LOCAL:
        primaryId = await this.storeToLocal(data);
        break;
    }

    if (primaryId && policy.cache) {
      await this.cacheData(dataType, primaryId, data, options?.ttl || policy.ttl);
    }

    this.logger.log(`数据存储完成: ${dataType} -> ${policy.primary}, ID: ${primaryId}`);
    return primaryId;
  }

  async retrieve(dataType: DataType, id: string): Promise<any | null> {
    const policy = this.getStoragePolicy(dataType);

    if (policy.cache) {
      const cachedData = await this.getFromCache(dataType, id);
      if (cachedData) {
        this.logger.debug(`缓存命中: ${dataType}`);
        return cachedData;
      }
    }

    let data: any = null;
    switch (policy.primary) {
      case StorageType.IPFS:
        data = await this.getFromIPFS(id);
        break;
      case StorageType.MYSQL:
        data = await this.getFromMySQL(dataType, id);
        break;
      case StorageType.REDIS:
        data = await this.getFromRedis(id);
        break;
      case StorageType.LOCAL:
        data = await this.getFromLocal(id);
        break;
    }

    if (data && policy.cache) {
      await this.cacheData(dataType, id, data, policy.ttl);
    }

    return data;
  }

  async delete(dataType: DataType, id: string): Promise<boolean> {
    const policy = this.getStoragePolicy(dataType);
    
    if (policy.cache) {
      await this.removeFromCache(dataType, id);
    }

    switch (policy.primary) {
      case StorageType.IPFS:
        return this.ipfs.unpin(id);
      case StorageType.REDIS:
        await this.redis.getClient().del(id);
        return true;
      default:
        return true;
    }
  }

  private async storeToIPFS(data: any, dataType: DataType): Promise<string> {
    if (Buffer.isBuffer(data)) {
      return this.ipfs.uploadFile(data, `${dataType}_${Date.now()}`);
    }
    return this.ipfs.uploadJSON(data, `${dataType}_${Date.now()}`);
  }

  private async storeToMySQL(dataType: DataType, data: any, userId?: number): Promise<string> {
    return `mysql_${Date.now()}`;
  }

  private async storeToRedis(data: any, ttl?: number): Promise<string> {
    const id = `redis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.redis.getClient().setEx(id, ttl || 3600, JSON.stringify(data));
    return id;
  }

  private async storeToLocal(data: any): Promise<string> {
    return `local_${Date.now()}`;
  }

  private async getFromIPFS(cid: string): Promise<any> {
    try {
      const buffer = await this.ipfs.getFile(cid);
      const content = buffer.toString('utf-8');
      try {
        return JSON.parse(content);
      } catch {
        return buffer;
      }
    } catch (error) {
      this.logger.error(`从IPFS获取数据失败: ${cid}`, error);
      return null;
    }
  }

  private async getFromMySQL(dataType: DataType, id: string): Promise<any> {
    return null;
  }

  private async getFromRedis(id: string): Promise<any> {
    try {
      const data = await this.redis.getClient().get(id);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(`从Redis获取数据失败: ${id}`, error);
      return null;
    }
  }

  private async getFromLocal(id: string): Promise<any> {
    return null;
  }

  private async cacheData(dataType: DataType, id: string, data: any, ttl?: number): Promise<void> {
    const cacheKey = `cache:${dataType}:${id}`;
    await this.redis.getClient().setEx(cacheKey, ttl || 3600, JSON.stringify(data));
  }

  private async getFromCache(dataType: DataType, id: string): Promise<any | null> {
    const cacheKey = `cache:${dataType}:${id}`;
    const cached = await this.redis.getClient().get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  }

  private async removeFromCache(dataType: DataType, id: string): Promise<void> {
    const cacheKey = `cache:${dataType}:${id}`;
    await this.redis.getClient().del(cacheKey);
  }

  getStorageStats(): { [key in StorageType]?: { used: number; available: number } } {
    return {
      [StorageType.IPFS]: { used: 0, available: Infinity },
      [StorageType.MYSQL]: { used: 0, available: Infinity },
      [StorageType.REDIS]: { used: 0, available: Infinity },
      [StorageType.LOCAL]: { used: 0, available: Infinity },
    };
  }

  getDataClassificationInfo(): { dataType: DataType; policy: StoragePolicy }[] {
    return Array.from(this.storagePolicies.entries()).map(([dataType, policy]) => ({
      dataType,
      policy,
    }));
  }
}
