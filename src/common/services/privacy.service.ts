import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/config/prisma.service';

export interface PrivacyCheckResult {
  allowed: boolean;
  reason?: string;
}

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(private prisma: PrismaService) {}

  async canViewProfile(viewerId: number | null, targetUserId: number): Promise<PrivacyCheckResult> {
    if (!viewerId || viewerId === targetUserId) {
      return { allowed: true };
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { blockedUserIds: true, isFrozen: true },
    });

    if (!targetUser) {
      return { allowed: false, reason: '用户不存在' };
    }

    if (targetUser.isFrozen) {
      return { allowed: false, reason: '用户账号已被冻结' };
    }

    const blockedIds = JSON.parse(targetUser.blockedUserIds || '[]') as number[];
    if (blockedIds.includes(viewerId)) {
      return { allowed: false, reason: '您已被该用户拉黑' };
    }

    return { allowed: true };
  }

  async canFollow(followerId: number, targetUserId: number): Promise<PrivacyCheckResult> {
    if (followerId === targetUserId) {
      return { allowed: false, reason: '不能关注自己' };
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { allowFollow: true, blockedUserIds: true, isFrozen: true },
    });

    if (!targetUser) {
      return { allowed: false, reason: '目标用户不存在' };
    }

    if (targetUser.isFrozen) {
      return { allowed: false, reason: '用户账号已被冻结' };
    }

    if (!targetUser.allowFollow) {
      return { allowed: false, reason: '该用户已关闭关注功能' };
    }

    const blockedIds = JSON.parse(targetUser.blockedUserIds || '[]') as number[];
    if (blockedIds.includes(followerId)) {
      return { allowed: false, reason: '您已被该用户拉黑' };
    }

    const viewerBlockedIds = await this.getUserBlockedIds(followerId);
    if (viewerBlockedIds.includes(targetUserId)) {
      return { allowed: false, reason: '您已拉黑该用户' };
    }

    return { allowed: true };
  }

  async canSendMessage(senderId: number, receiverId: number): Promise<PrivacyCheckResult> {
    if (senderId === receiverId) {
      return { allowed: false, reason: '不能给自己发送消息' };
    }

    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { allowMessage: true, blockedUserIds: true, isFrozen: true },
    });

    if (!receiver) {
      return { allowed: false, reason: '接收者不存在' };
    }

    if (receiver.isFrozen) {
      return { allowed: false, reason: '用户账号已被冻结' };
    }

    if (!receiver.allowMessage) {
      return { allowed: false, reason: '该用户已关闭私信功能' };
    }

    const blockedIds = JSON.parse(receiver.blockedUserIds || '[]') as number[];
    if (blockedIds.includes(senderId)) {
      return { allowed: false, reason: '您已被对方拉黑' };
    }

    const senderBlockedIds = await this.getUserBlockedIds(senderId);
    if (senderBlockedIds.includes(receiverId)) {
      return { allowed: false, reason: '您已拉黑该用户' };
    }

    return { allowed: true };
  }

  async canViewFollowing(viewerId: number | null, targetUserId: number): Promise<PrivacyCheckResult> {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { hideFollowing: true, blockedUserIds: true },
    });

    if (!targetUser) {
      return { allowed: false, reason: '用户不存在' };
    }

    if (targetUser.hideFollowing && viewerId !== targetUserId) {
      return { allowed: false, reason: '该用户已隐藏关注列表' };
    }

    if (viewerId) {
      const blockedIds = JSON.parse(targetUser.blockedUserIds || '[]') as number[];
      if (blockedIds.includes(viewerId)) {
        return { allowed: false, reason: '您已被该用户拉黑' };
      }
    }

    return { allowed: true };
  }

  async canViewFollowers(viewerId: number | null, targetUserId: number): Promise<PrivacyCheckResult> {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { hideFollowers: true, blockedUserIds: true },
    });

    if (!targetUser) {
      return { allowed: false, reason: '用户不存在' };
    }

    if (targetUser.hideFollowers && viewerId !== targetUserId) {
      return { allowed: false, reason: '该用户已隐藏粉丝列表' };
    }

    if (viewerId) {
      const blockedIds = JSON.parse(targetUser.blockedUserIds || '[]') as number[];
      if (blockedIds.includes(viewerId)) {
        return { allowed: false, reason: '您已被该用户拉黑' };
      }
    }

    return { allowed: true };
  }

  async canViewContent(viewerId: number | null, authorId: number): Promise<PrivacyCheckResult> {
    if (viewerId === authorId) {
      return { allowed: true };
    }

    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { blockedUserIds: true, isFrozen: true },
    });

    if (!author) {
      return { allowed: false, reason: '作者不存在' };
    }

    if (author.isFrozen) {
      return { allowed: false, reason: '作者账号已被冻结' };
    }

    if (viewerId) {
      const blockedIds = JSON.parse(author.blockedUserIds || '[]') as number[];
      if (blockedIds.includes(viewerId)) {
        return { allowed: false, reason: '您已被作者拉黑' };
      }
    }

    return { allowed: true };
  }

  async isBlocked(userId: number, targetUserId: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { blockedUserIds: true },
    });

    if (!user) return false;

    const blockedIds = JSON.parse(user.blockedUserIds || '[]') as number[];
    return blockedIds.includes(targetUserId);
  }

  async hasBlocked(userId: number, targetUserId: number): Promise<boolean> {
    return this.isBlocked(userId, targetUserId);
  }

  async getUserBlockedIds(userId: number): Promise<number[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { blockedUserIds: true },
    });

    if (!user) return [];
    return JSON.parse(user.blockedUserIds || '[]') as number[];
  }

  async checkPrivacyAndThrow(
    check: Promise<PrivacyCheckResult>,
  ): Promise<void> {
    const result = await check;
    if (!result.allowed) {
      throw new ForbiddenException(result.reason || '无权访问');
    }
  }
}
