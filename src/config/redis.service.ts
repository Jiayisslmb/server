import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;
  private subscriberClient: RedisClientType;
  private isConnected = false;

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.client = createClient({ url: redisUrl });
    this.subscriberClient = createClient({ url: redisUrl });

    this.client.on('error', (err) => {
      console.error('Redis客户端错误:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis连接成功');
      this.isConnected = true;
    });

    await this.client.connect();
    await this.subscriberClient.connect();
  }

  async onModuleDestroy() {
    await this.client?.disconnect();
    await this.subscriberClient?.disconnect();
  }

  getClient(): RedisClientType {
    return this.client;
  }

  getSubscriber(): RedisClientType {
    return this.subscriberClient;
  }

  isReady(): boolean {
    return this.isConnected;
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async set(key: string, value: string | number, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, String(value));
    } else {
      await this.client.set(key, String(value));
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async delMany(keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  async setUserOnline(userId: number, socketId: string): Promise<void> {
    await this.client.hSet('online_users', userId.toString(), socketId);
    await this.client.expire('online_users', 86400);
  }

  async setUserOffline(userId: number): Promise<void> {
    await this.client.hDel('online_users', userId.toString());
  }

  async isUserOnline(userId: number): Promise<boolean> {
    const socketId = await this.client.hGet('online_users', userId.toString());
    return !!socketId;
  }

  async getOnlineUsers(): Promise<Record<string, string>> {
    return await this.client.hGetAll('online_users');
  }

  async cacheMessage(messageId: string, message: any, ttl: number = 3600): Promise<void> {
    await this.client.setEx(`message:${messageId}`, ttl, JSON.stringify(message));
  }

  async getCachedMessage(messageId: string): Promise<any | null> {
    const data = await this.client.get(`message:${messageId}`);
    return data ? JSON.parse(data) : null;
  }

  async cacheUserSession(userId: number, sessionData: any, ttl: number = 86400): Promise<void> {
    await this.client.setEx(`session:${userId}`, ttl, JSON.stringify(sessionData));
  }

  async getUserSession(userId: number): Promise<any | null> {
    const data = await this.client.get(`session:${userId}`);
    return data ? JSON.parse(data) : null;
  }

  async publish(channel: string, message: any): Promise<void> {
    await this.client.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    await this.subscriberClient.subscribe(channel, (message) => {
      try {
        callback(JSON.parse(message));
      } catch (error) {
        console.error('解析消息失败:', error);
      }
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriberClient.unsubscribe(channel);
  }

  async incrementUnreadCount(userId: number): Promise<number> {
    return await this.client.incr(`unread:${userId}`);
  }

  async getUnreadCount(userId: number): Promise<number> {
    const count = await this.client.get(`unread:${userId}`);
    return parseInt(count || '0', 10);
  }

  async resetUnreadCount(userId: number): Promise<void> {
    await this.client.set(`unread:${userId}`, '0');
  }

  async cacheHotPosts(posts: any[], ttl: number = 300): Promise<void> {
    await this.client.setEx('hot_posts', ttl, JSON.stringify(posts));
  }

  async getHotPosts(): Promise<any[] | null> {
    const data = await this.client.get('hot_posts');
    return data ? JSON.parse(data) : null;
  }

  async cacheCircleMembers(circleId: number, members: any[], ttl: number = 600): Promise<void> {
    await this.client.setEx(`circle:${circleId}:members`, ttl, JSON.stringify(members));
  }

  async getCircleMembers(circleId: number): Promise<any[] | null> {
    const data = await this.client.get(`circle:${circleId}:members`);
    return data ? JSON.parse(data) : null;
  }

  async increment(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  async getKeys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  async setUserLastSeen(userId: number, timestamp: number): Promise<void> {
    await this.client.setEx(`user:${userId}:lastSeen`, 86400, timestamp.toString());
  }

  async getUserLastSeen(userId: number): Promise<number | null> {
    const timestamp = await this.client.get(`user:${userId}:lastSeen`);
    return timestamp ? parseInt(timestamp, 10) : null;
  }

  async getMultipleUserStatus(userIds: number[]): Promise<Map<number, { isOnline: boolean; lastSeen: number | null }>> {
    const statusMap = new Map<number, { isOnline: boolean; lastSeen: number | null }>();
    
    for (const userId of userIds) {
      const isOnline = await this.isUserOnline(userId);
      const lastSeen = await this.getUserLastSeen(userId);
      statusMap.set(userId, { isOnline, lastSeen });
    }
    
    return statusMap;
  }
}
