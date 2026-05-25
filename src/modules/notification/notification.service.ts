import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/config/prisma.service';

export interface CreateNotificationDto {
  type: 'like' | 'comment' | 'reply' | 'follow' | 'system';
  userId: number;
  fromUserId?: number;
  articleId?: number;
  momentId?: number;
  commentId?: number;
  content?: string;
  postContent?: string;
  commentContent?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private prisma: PrismaService) {}

  async createNotification(data: CreateNotificationDto) {
    if (data.fromUserId && data.fromUserId === data.userId) {
      return null;
    }

    const notification = await this.prisma.notification.create({
      data: {
        type: data.type,
        userId: data.userId,
        fromUserId: data.fromUserId,
        articleId: data.articleId,
        momentId: data.momentId,
        commentId: data.commentId,
        content: data.content,
      },
    });

    this.logger.log(`创建通知: ${data.type} -> 用户 ${data.userId}`);
    return notification;
  }

  async getNotifications(userId: number, type?: string, skip: number = 0, take: number = 20) {
    const where: any = { userId };
    if (type && type !== 'all') {
      where.type = type;
    }

    const notifications = await this.prisma.notification.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });

    const enrichedNotifications = await Promise.all(
      notifications.map(async (notification) => {
        let user: { id: number; username: string; avatarCid: string | null } | null = null;
        let contentItem: { id: number; content: string; title?: string | null } | null = null;

        if (notification.fromUserId) {
          user = await this.prisma.user.findUnique({
            where: { id: notification.fromUserId },
            select: { id: true, username: true, nickname: true, avatarCid: true },
          });
        }

        if (notification.articleId) {
          contentItem = await this.prisma.article.findUnique({
            where: { id: notification.articleId },
            select: { id: true, content: true, title: true },
          });
        } else if (notification.momentId) {
          contentItem = await this.prisma.moment.findUnique({
            where: { id: notification.momentId },
            select: { id: true, content: true },
          });
        }

        return {
          id: notification.id,
          type: notification.type,
          userId: notification.userId,
          articleId: notification.articleId,
          momentId: notification.momentId,
          commentId: notification.commentId,
          content: notification.content,
          createdAt: notification.createdAt,
          isRead: notification.isRead,
          user: user || { id: 0, username: '未知用户', avatarCid: null },
          postContent: contentItem?.content || contentItem?.title,
        };
      })
    );

    return enrichedNotifications;
  }

  async getUnreadCount(userId: number): Promise<{ total: number; likes: number; comments: number; follows: number }> {
    const [total, likes, comments, follows] = await Promise.all([
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.prisma.notification.count({ where: { userId, isRead: false, type: 'like' } }),
      this.prisma.notification.count({ where: { userId, isRead: false, type: 'comment' } }),
      this.prisma.notification.count({ where: { userId, isRead: false, type: 'follow' } }),
    ]);

    return { total, likes, comments, follows };
  }

  async markAsRead(userId: number, notificationId: number) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: number, type?: string) {
    const where: any = { userId, isRead: false };
    if (type && type !== 'all') {
      where.type = type;
    }

    return this.prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });
  }

  async deleteNotification(userId: number, notificationId: number) {
    return this.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
  }

  async batchDeleteNotifications(userId: number, ids: number[]) {
    return this.prisma.notification.deleteMany({
      where: {
        id: { in: ids },
        userId,
      },
    });
  }
}
