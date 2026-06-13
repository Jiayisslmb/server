import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/config/prisma.service';
import { RedisService } from 'src/config/redis.service';
import { EncryptionService } from 'src/common/services/encryption.service';
import { SendMessageDto } from './dto';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private encryptionService: EncryptionService,
  ) {}

  async sendMessage(
    senderId: number,
    receiverId: number,
    sendMessageDto: SendMessageDto,
  ) {
    if (senderId === receiverId) {
      throw new BadRequestException('不能给自己发送消息');
    }

    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true, allowMessage: true, blockedUserIds: true },
    });

    if (!receiver) {
      throw new NotFoundException('接收者不存在');
    }

    if (!receiver.allowMessage) {
      throw new ForbiddenException('该用户已关闭私信功能');
    }

    const blockedIds = JSON.parse(receiver.blockedUserIds || '[]') as number[];
    if (blockedIds.includes(senderId)) {
      throw new ForbiddenException('您已被对方拉黑，无法发送消息');
    }

    const encryptedContent = this.encryptionService.encryptForStorage(sendMessageDto.content);

    const message = await this.prisma.message.create({
      data: {
        content: encryptedContent,
        mediaCid: sendMessageDto.mediaCid,
        senderId,
        receiverId,
      },
      include: {
        user_message_senderIdTouser: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
      },
    });

    await this.redis.cacheMessage(`msg:${message.id}`, message, 3600);
    await this.redis.incrementUnreadCount(receiverId);
    
    await this.redis.publish(`user:${receiverId}:messages`, {
      type: 'new_message',
      message: {
        id: message.id,
        content: sendMessageDto.content,
        senderId: message.senderId,
        receiverId: message.receiverId,
        createdAt: message.createdAt,
        sender: message.user_message_senderIdTouser,
      },
    });

    this.logger.log(`消息已发送: ${senderId} -> ${receiverId}, 已加密`);

    return {
      id: message.id,
      content: sendMessageDto.content,
      senderId: message.senderId,
      receiverId: message.receiverId,
      createdAt: message.createdAt,
      sender: message.user_message_senderIdTouser,
    };
  }

  async getConversation(userId: number, otherId: number, skip: number = 0, take: number = 50) {
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherId },
          { senderId: otherId, receiverId: userId },
        ],
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user_message_senderIdTouser: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
      },
    });

    const decryptedMessages = messages.map(msg => {
      try {
        const decryptedContent = this.encryptionService.decryptFromStorage(msg.content);
        return {
          id: msg.id,
          content: decryptedContent,
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          createdAt: msg.createdAt,
          isRead: msg.isRead,
          sender: msg.user_message_senderIdTouser,
        };
      } catch (error) {
        this.logger.warn(`消息 ${msg.id} 解密失败: ${error.message}`);
        return {
          id: msg.id,
          content: '[消息内容无法解密]',
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          createdAt: msg.createdAt,
          isRead: msg.isRead,
          sender: msg.user_message_senderIdTouser,
        };
      }
    });

    await this.prisma.message.updateMany({
      where: {
        senderId: otherId,
        receiverId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    await this.redis.resetUnreadCount(userId);

    return decryptedMessages.reverse();
  }

  async getConversationList(userId: number) {
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user_message_senderIdTouser: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
        user_message_receiverIdTouser: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
      },
    });

    const conversations = new Map();

    for (const message of messages) {
      const otherId = message.senderId === userId ? message.receiverId : message.senderId;
      
      if (otherId === userId) {
        continue;
      }

      const otherUser = message.senderId === userId ? message.user_message_receiverIdTouser : message.user_message_senderIdTouser;

      if (!otherUser) {
        continue;
      }

      if (!conversations.has(otherId)) {
        const unreadCount = await this.prisma.message.count({
          where: {
            senderId: otherId,
            receiverId: userId,
            isRead: false,
          },
        });

        let lastMessageContent = '[加密消息]';
        try {
          const decrypted = this.encryptionService.decryptFromStorage(message.content);
          lastMessageContent = decrypted.length > 50 ? decrypted.substring(0, 50) + '...' : decrypted;
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logger.warn(`消息 ${message.id} 解密失败: ${errMsg}`);
        }

        conversations.set(otherId, {
          userId: otherId,
          user: otherUser,
          lastMessage: lastMessageContent,
          lastMessageTime: message.createdAt,
          unreadCount,
        });
      }
    }

    return Array.from(conversations.values());
  }

  async getUnreadCount(userId: number) {
    const cachedCount = await this.redis.getUnreadCount(userId);
    if (cachedCount > 0) {
      return cachedCount;
    }
    
    const count = await this.prisma.message.count({
      where: {
        receiverId: userId,
        isRead: false,
      },
    });
    
    return count;
  }

  async markAsRead(userId: number, senderId: number) {
    const result = await this.prisma.message.updateMany({
      where: {
        senderId,
        receiverId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });
    
    await this.redis.resetUnreadCount(userId);
    
    return result;
  }

  async deleteMessage(messageId: number, userId: number) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('消息不存在');
    }

    if (message.senderId !== userId && message.receiverId !== userId) {
      throw new ForbiddenException('无权删除此消息');
    }

    await this.prisma.message.delete({ where: { id: messageId } });
    
    return { success: true };
  }
}
