import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { RedisService } from 'src/config/redis.service';
import { PrismaService } from 'src/config/prisma.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { EncryptionService } from 'src/common/services/encryption.service';

interface UserSocket {
  userId: number;
  socketId: string;
  username: string;
  deviceIds: Set<string>;
  lastHeartbeat: Map<string, number>;
  lastActivity: number;
  connectionTime: number;
}

interface MessagePayload {
  receiverId: number;
  content: string;
  mediaCid?: string;
  tempId?: string;
}

interface TypingPayload {
  receiverId: number;
  isTyping: boolean;
}

interface HeartbeatConfig {
  interval: number;
  timeout: number;
  maxMissed: number;
  statusBroadcastInterval: number;
}

interface UserStatusInfo {
  userId: number;
  isOnline: boolean;
  lastSeen?: string;
  deviceCount?: number;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://app.desocial.com',
      'https://client-six-lac-79.vercel.app',
      ...(process.env.CORS_ORIGINS?.split(',').filter(Boolean) || []),
    ],
    credentials: true,
  },
  namespace: '/api/chat',
  path: '/api/socket.io',
  pingInterval: 25000,
  pingTimeout: 60000,
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private userSockets: Map<number, UserSocket> = new Map();
  private socketToUser: Map<string, number> = new Map();
  private jwtSecret: string;
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private missedHeartbeats: Map<string, number> = new Map();
  private statusBroadcastTimer: NodeJS.Timeout | null = null;
  private lastStatusBroadcast: Map<number, boolean> = new Map();
  
  private readonly heartbeatConfig: HeartbeatConfig = {
    interval: 15000,
    timeout: 45000,
    maxMissed: 3,
    statusBroadcastInterval: 0,
  };

  constructor(
    private configService: ConfigService,
    private redis: RedisService,
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private encryptionService: EncryptionService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET') || '';
    if (!this.jwtSecret || this.jwtSecret.length < 32) {
      throw new Error('JWT_SECRET 未配置或长度不足（至少32字符）。请在 .env 文件中设置强随机密钥。');
    }
    this.startHeartbeatChecker();
    this.startStatusBroadcast();
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');
      
      this.logger.log(`客户端尝试连接: ${client.id}, token存在: ${!!token}`);
      
      if (!token) {
        this.logger.warn(`客户端 ${client.id} 未提供认证令牌`);
        client.emit('error', { message: '未提供认证令牌', code: 'AUTH_MISSING' });
        setTimeout(() => client.disconnect(), 100);
        return;
      }

      let payload: any;
      try {
        payload = jwt.verify(token, this.jwtSecret);
        this.logger.log(`Token验证成功: userId=${payload.id || payload.sub}`);
      } catch (err) {
        this.logger.warn(`客户端 ${client.id} Token验证失败: ${err.message}`);
        client.emit('error', { message: '认证令牌无效或已过期', code: 'AUTH_INVALID' });
        setTimeout(() => client.disconnect(), 100);
        return;
      }

      const userId = payload.id || payload.sub || payload.userId;
      
      if (!userId) {
        this.logger.warn(`客户端 ${client.id} Token中无用户ID`);
        client.emit('error', { message: '无效的认证令牌', code: 'AUTH_INVALID_USER' });
        setTimeout(() => client.disconnect(), 100);
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, nickname: true, isFrozen: true },
      });

      if (!user || user.isFrozen) {
        this.logger.warn(`用户 ${userId} 不存在或已被冻结`);
        client.emit('error', { message: '用户不存在或已被冻结', code: 'USER_INVALID' });
        setTimeout(() => client.disconnect(), 100);
        return;
      }

      client.data.userId = userId;
      client.data.username = user.username;
      client.data.connectedAt = Date.now();
      this.socketToUser.set(client.id, userId);

      const now = Date.now();
      const wasOnline = this.userSockets.has(userId);
      
      if (wasOnline) {
        const userSocket = this.userSockets.get(userId)!;
        userSocket.deviceIds.add(client.id);
        userSocket.lastHeartbeat.set(client.id, now);
        userSocket.lastActivity = now;
        userSocket.socketId = client.id;
        this.logger.log(`用户 ${user.username}(${userId}) 添加新设备: ${client.id}, 总设备数: ${userSocket.deviceIds.size}`);
      } else {
        const lastHeartbeat = new Map<string, number>();
        lastHeartbeat.set(client.id, now);
        
        this.userSockets.set(userId, {
          userId,
          socketId: client.id,
          username: user.username,
          deviceIds: new Set([client.id]),
          lastHeartbeat,
          lastActivity: now,
          connectionTime: now,
        });
        this.logger.log(`用户 ${user.username}(${userId}) 首次连接，设备: ${client.id}`);
      }

      this.missedHeartbeats.set(client.id, 0);
      this.startClientHeartbeat(client.id);

      try {
        await this.redis.setUserOnline(userId, client.id);
        await this.redis.setUserLastSeen(userId, now);
      } catch (redisErr) {
        this.logger.error(`Redis设置在线状态失败: ${redisErr.message}`);
      }

      const unreadCount = await this.getUnreadCount(userId);
      const onlineUsers = await this.getOnlineUserIds();
      
      client.emit('connected', { 
        userId, 
        username: user.username,
        unreadCount,
        heartbeatInterval: this.heartbeatConfig.interval,
        serverTime: now,
        onlineUsers,
      });

      if (!wasOnline) {
        this.broadcastUserStatus(userId, true, now);
      }

      this.logger.log(`用户 ${user.username}(${userId}) 连接成功，设备: ${client.id}`);
    } catch (error) {
      this.logger.error(`连接认证失败: ${error.message}`);
      client.emit('error', { message: '认证失败: ' + error.message, code: 'AUTH_ERROR' });
      setTimeout(() => client.disconnect(), 100);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = this.socketToUser.get(client.id);
    const now = Date.now();
    
    this.stopClientHeartbeat(client.id);
    this.missedHeartbeats.delete(client.id);
    
    if (userId) {
      const userSocket = this.userSockets.get(userId);
      
      if (userSocket) {
        userSocket.deviceIds.delete(client.id);
        userSocket.lastHeartbeat.delete(client.id);
        
        if (userSocket.deviceIds.size === 0) {
          this.userSockets.delete(userId);
          try {
            await this.redis.setUserOffline(userId);
            await this.redis.setUserLastSeen(userId, now);
          } catch (redisErr) {
            this.logger.error(`Redis设置离线状态失败: ${redisErr.message}`);
          }
          this.broadcastUserStatus(userId, false, now);
          this.logger.log(`用户 ${userId} 已完全离线`);
        } else {
          userSocket.lastActivity = now;
          this.logger.log(`用户 ${userId} 的设备 ${client.id} 已断开，剩余设备: ${userSocket.deviceIds.size}`);
        }
      }
      
      this.socketToUser.delete(client.id);
    }
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { timestamp?: number; active?: boolean },
  ) {
    const userId = this.socketToUser.get(client.id);
    
    if (!userId) {
      client.emit('error', { message: '未认证的连接', code: 'NOT_AUTHENTICATED' });
      return;
    }

    const userSocket = this.userSockets.get(userId);
    const now = Date.now();
    
    if (userSocket) {
      userSocket.lastHeartbeat.set(client.id, now);
      if (payload?.active) {
        userSocket.lastActivity = now;
      }
    }

    this.missedHeartbeats.set(client.id, 0);

    client.emit('heartbeat_ack', {
      serverTime: now,
      clientTime: payload?.timestamp,
      onlineUsers: await this.getOnlineUserIds(),
    });
  }

  @SubscribeMessage('ping')
  async handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: Date.now() });
  }

  @SubscribeMessage('get_user_status')
  async handleGetUserStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userIds: number[] },
  ) {
    const statuses: UserStatusInfo[] = [];
    
    for (const userId of payload.userIds) {
      const isOnline = this.isUserOnline(userId);
      const lastSeen = await this.redis.getUserLastSeen(userId);
      const userSocket = this.userSockets.get(userId);
      
      statuses.push({
        userId,
        isOnline,
        lastSeen: lastSeen ? new Date(lastSeen).toISOString() : undefined,
        deviceCount: userSocket?.deviceIds.size || 0,
      });
    }
    
    client.emit('user_statuses', statuses);
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MessagePayload,
  ) {
    const senderId = client.data.userId;
    
    if (!senderId || !payload.receiverId || !payload.content?.trim()) {
      client.emit('error', { message: '无效的消息参数', code: 'INVALID_MESSAGE' });
      return;
    }

    try {
      const encryptedContent = this.encryptionService.encryptForStorage(payload.content);
      const message = await this.prisma.message.create({
        data: {
          content: encryptedContent,
          mediaCid: payload.mediaCid,
          senderId,
          receiverId: payload.receiverId,
        },
        include: {
          user_message_senderIdTouser: {
            select: { id: true, username: true, nickname: true, avatarCid: true },
          },
        },
      });

      await this.redis.cacheMessage(`msg:${message.id}`, message, 3600);
      await this.redis.incrementUnreadCount(payload.receiverId);

      const messageData = {
        id: message.id,
        content: payload.content,
        senderId: message.senderId,
        receiverId: message.receiverId,
        createdAt: message.createdAt,
        sender: message.user_message_senderIdTouser,
        tempId: payload.tempId,
      };

      client.emit('message_sent', messageData);

      const receiverSocket = this.userSockets.get(payload.receiverId);
      if (receiverSocket) {
        for (const socketId of receiverSocket.deviceIds) {
          this.server.to(socketId).emit('new_message', messageData);
        }
      }

      await this.redis.publish(`user:${payload.receiverId}:messages`, {
        type: 'new_message',
        message: messageData,
      });

      this.logger.log(`消息已发送: ${senderId} -> ${payload.receiverId}`);
    } catch (error) {
      this.logger.error(`发送消息失败: ${error.message}`);
      client.emit('error', { message: '发送消息失败', tempId: payload.tempId, code: 'SEND_ERROR' });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload,
  ) {
    const senderId = client.data.userId;
    const receiverSocket = this.userSockets.get(payload.receiverId);
    
    if (receiverSocket) {
      for (const socketId of receiverSocket.deviceIds) {
        this.server.to(socketId).emit('user_typing', {
          userId: senderId,
          username: client.data.username,
          isTyping: payload.isTyping,
        });
      }
    }
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { senderId: number },
  ) {
    const userId = client.data.userId;
    
    if (!userId || !payload.senderId) return;

    await this.prisma.message.updateMany({
      where: {
        senderId: payload.senderId,
        receiverId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    await this.redis.resetUnreadCount(userId);

    const senderSocket = this.userSockets.get(payload.senderId);
    if (senderSocket) {
      for (const socketId of senderSocket.deviceIds) {
        this.server.to(socketId).emit('messages_read', {
          byUserId: userId,
          senderId: payload.senderId,
        });
      }
    }
  }

  @SubscribeMessage('get_online_users')
  async handleGetOnlineUsers(@ConnectedSocket() client: Socket) {
    const onlineUsers = Array.from(this.userSockets.values()).map(us => ({
      userId: us.userId,
      username: us.username,
      deviceCount: us.deviceIds.size,
      lastActivity: us.lastActivity,
    }));
    
    client.emit('online_users', onlineUsers);
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { otherUserId: number },
  ) {
    const userId = client.data.userId;
    const roomName = this.getConversationRoomName(userId, payload.otherUserId);
    client.join(roomName);
    
    await this.prisma.message.updateMany({
      where: {
        senderId: payload.otherUserId,
        receiverId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    await this.redis.resetUnreadCount(userId);
    
    const otherUserStatus = this.isUserOnline(payload.otherUserId);
    const lastSeen = await this.redis.getUserLastSeen(payload.otherUserId);
    
    client.emit('joined_conversation', { 
      otherUserId: payload.otherUserId,
      otherUserOnline: otherUserStatus,
      otherUserLastSeen: lastSeen ? new Date(lastSeen).toISOString() : undefined,
    });
  }

  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { otherUserId: number },
  ) {
    const userId = client.data.userId;
    const roomName = this.getConversationRoomName(userId, payload.otherUserId);
    client.leave(roomName);
  }

  private startClientHeartbeat(socketId: string): void {
    const timer = setInterval(() => {
      this.checkClientHeartbeat(socketId);
    }, this.heartbeatConfig.interval);
    
    this.heartbeatTimers.set(socketId, timer);
  }

  private stopClientHeartbeat(socketId: string): void {
    const timer = this.heartbeatTimers.get(socketId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(socketId);
    }
  }

  private checkClientHeartbeat(socketId: string): void {
    const userId = this.socketToUser.get(socketId);
    if (!userId) {
      this.stopClientHeartbeat(socketId);
      return;
    }

    const userSocket = this.userSockets.get(userId);
    if (!userSocket) {
      this.stopClientHeartbeat(socketId);
      return;
    }

    const lastHeartbeat = userSocket.lastHeartbeat.get(socketId) || 0;
    const now = Date.now();
    const elapsed = now - lastHeartbeat;

    if (elapsed > this.heartbeatConfig.timeout) {
      const missed = (this.missedHeartbeats.get(socketId) || 0) + 1;
      this.missedHeartbeats.set(socketId, missed);

      this.logger.warn(
        `客户端 ${socketId} 心跳超时 (已超时 ${Math.round(elapsed / 1000)}秒, 错过次数: ${missed})`,
      );

      if (missed >= this.heartbeatConfig.maxMissed) {
        this.logger.warn(`客户端 ${socketId} 心跳超时次数过多，断开连接`);
        try {
          if (this.server && this.server.sockets && this.server.sockets.sockets) {
            const socket = this.server.sockets.sockets.get(socketId);
            if (socket) {
              socket.emit('error', { message: '心跳超时，连接已断开', code: 'HEARTBEAT_TIMEOUT' });
              socket.disconnect(true);
            }
          }
        } catch (err) {
          this.logger.error(`断开连接时出错: ${err.message}`);
        }
        this.stopClientHeartbeat(socketId);
      } else {
        try {
          if (this.server && this.server.sockets && this.server.sockets.sockets) {
            const socket = this.server.sockets.sockets.get(socketId);
            if (socket) {
              socket.emit('heartbeat_check', { timestamp: now });
            }
          }
        } catch (err) {
          this.logger.error(`发送心跳检查时出错: ${err.message}`);
        }
      }
    }
  }

  private startHeartbeatChecker(): void {
    setInterval(() => {
      this.cleanupStaleConnections();
    }, this.heartbeatConfig.interval * 2);
  }

  private startStatusBroadcast(): void {
    // Status broadcast is now event-driven (on connect/disconnect)
    // Periodic broadcast disabled to reduce network traffic
  }

  private async broadcastAllOnlineUsers(): Promise<void> {
    const onlineUserIds = await this.getOnlineUserIds();
    this.server.emit('online_users_update', onlineUserIds);
  }

  private cleanupStaleConnections(): void {
    if (!this.server || !this.server.sockets || !this.server.sockets.sockets) {
      return;
    }

    const now = Date.now();
    const staleThreshold = this.heartbeatConfig.timeout * 2;

    for (const [socketId, userId] of this.socketToUser) {
      const userSocket = this.userSockets.get(userId);
      if (!userSocket) continue;

      const lastHeartbeat = userSocket.lastHeartbeat.get(socketId) || 0;
      if (now - lastHeartbeat > staleThreshold) {
        this.logger.warn(`清理过期连接: ${socketId}`);
        
        try {
          const socket = this.server.sockets.sockets.get(socketId);
          if (socket) {
            socket.disconnect(true);
          }
        } catch (err) {
          this.logger.error(`断开连接时出错: ${err.message}`);
        }
      }
    }
  }

  private getConversationRoomName(userId1: number, userId2: number): string {
    const ids = [userId1, userId2].sort((a, b) => a - b);
    return `conversation:${ids[0]}:${ids[1]}`;
  }

  private async getUnreadCount(userId: number): Promise<number> {
    const cachedCount = await this.redis.getUnreadCount(userId);
    if (cachedCount > 0) return cachedCount;
    
    return this.prisma.message.count({
      where: { receiverId: userId, isRead: false },
    });
  }

  private async getOnlineUserIds(): Promise<number[]> {
    return Array.from(this.userSockets.keys());
  }

  // 广播通知给指定用户
  async broadcastNotification(userId: number, notification: any): Promise<void> {
    const userSocket = this.userSockets.get(userId);
    if (userSocket) {
      for (const socketId of userSocket.deviceIds) {
        try {
          this.server.to(socketId).emit('new_notification', notification);
          this.logger.log(`通知已广播给用户 ${userId}，设备: ${socketId}`);
        } catch (error) {
          this.logger.error(`广播通知失败: ${error.message}`);
        }
      }
    }
  }

  // 处理获取通知
  @SubscribeMessage('get_notifications')
  async handleGetNotifications(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { type?: string; skip?: number; take?: number },
  ) {
    const userId = client.data.userId;
    if (!userId) {
      client.emit('error', { message: '未认证的连接', code: 'NOT_AUTHENTICATED' });
      return;
    }

    try {
      const notifications = await this.notificationService.getNotifications(
        userId,
        payload.type,
        payload.skip || 0,
        payload.take || 20,
      );
      
      const unreadCount = await this.notificationService.getUnreadCount(userId);
      
      client.emit('notifications', {
        notifications,
        unreadCount,
      });
    } catch (error) {
      this.logger.error(`获取通知失败: ${error.message}`);
      client.emit('error', { message: '获取通知失败', code: 'NOTIFICATION_ERROR' });
    }
  }

  // 处理标记通知为已读
  @SubscribeMessage('mark_notification_read')
  async handleMarkNotificationRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { notificationId: number },
  ) {
    const userId = client.data.userId;
    if (!userId || !payload.notificationId) {
      client.emit('error', { message: '无效的参数', code: 'INVALID_PARAMS' });
      return;
    }

    try {
      await this.notificationService.markAsRead(userId, payload.notificationId);
      client.emit('notification_read', { notificationId: payload.notificationId });
    } catch (error) {
      this.logger.error(`标记通知已读失败: ${error.message}`);
      client.emit('error', { message: '标记通知已读失败', code: 'NOTIFICATION_ERROR' });
    }
  }

  // 处理标记所有通知为已读
  @SubscribeMessage('mark_all_notifications_read')
  async handleMarkAllNotificationsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { type?: string },
  ) {
    const userId = client.data.userId;
    if (!userId) {
      client.emit('error', { message: '未认证的连接', code: 'NOT_AUTHENTICATED' });
      return;
    }

    try {
      await this.notificationService.markAllAsRead(userId, payload.type);
      client.emit('all_notifications_read', { type: payload.type });
    } catch (error) {
      this.logger.error(`标记所有通知已读失败: ${error.message}`);
      client.emit('error', { message: '标记所有通知已读失败', code: 'NOTIFICATION_ERROR' });
    }
  }

  // 处理获取未读通知数
  @SubscribeMessage('get_unread_notifications')
  async handleGetUnreadNotifications(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (!userId) {
      client.emit('error', { message: '未认证的连接', code: 'NOT_AUTHENTICATED' });
      return;
    }

    try {
      const unreadCount = await this.notificationService.getUnreadCount(userId);
      client.emit('unread_notifications', unreadCount);
    } catch (error) {
      this.logger.error(`获取未读通知数失败: ${error.message}`);
      client.emit('error', { message: '获取未读通知数失败', code: 'NOTIFICATION_ERROR' });
    }
  }

  private broadcastUserStatus(userId: number, isOnline: boolean, timestamp: number) {
    const status: UserStatusInfo = {
      userId,
      isOnline,
      lastSeen: new Date(timestamp).toISOString(),
    };
    
    this.server.emit('user_status', status);
    this.lastStatusBroadcast.set(userId, isOnline);
  }

  isUserOnline(userId: number): boolean {
    return this.userSockets.has(userId);
  }

  getUserDevices(userId: number): string[] {
    const userSocket = this.userSockets.get(userId);
    return userSocket ? Array.from(userSocket.deviceIds) : [];
  }

  getOnlineUserCount(): number {
    return this.userSockets.size;
  }

  sendToUser(userId: number, event: string, data: any): boolean {
    const userSocket = this.userSockets.get(userId);
    if (userSocket) {
      for (const socketId of userSocket.deviceIds) {
        this.server.to(socketId).emit(event, data);
      }
      return true;
    }
    return false;
  }

  getConnectionStats(): {
    totalUsers: number;
    totalConnections: number;
    avgConnectionsPerUser: number;
  } {
    let totalConnections = 0;
    for (const userSocket of this.userSockets.values()) {
      totalConnections += userSocket.deviceIds.size;
    }
    
    return {
      totalUsers: this.userSockets.size,
      totalConnections,
      avgConnectionsPerUser: this.userSockets.size > 0 
        ? totalConnections / this.userSockets.size 
        : 0,
    };
  }

  async getUserLastActivity(userId: number): Promise<number | null> {
    const userSocket = this.userSockets.get(userId);
    return userSocket ? userSocket.lastActivity : await this.redis.getUserLastSeen(userId);
  }
}
