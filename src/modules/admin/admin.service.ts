import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/config/prisma.service';
import * as bcrypt from 'bcrypt';

function generateTempPassword(): string {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  password += charset.match(/[a-z]/)![Math.floor(Math.random() * 26)];
  password += charset.match(/[A-Z]/)![Math.floor(Math.random() * 26)];
  password += charset.match(/[0-9]/)![Math.floor(Math.random() * 10)];
  password += charset.match(/[!@#$%^&*]/)![Math.floor(Math.random() * 7)];
  
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
  ) {}

  async getAllUsers(skip: number = 0, take: number = 20) {
    return this.prisma.user.findMany({
      skip,
      take,
      select: {
        id: true,
        username: true,
        isAdmin: true,
        isFrozen: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async freezeUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (user.isFrozen) {
      throw new BadRequestException('用户已被冻结');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { isFrozen: true },
      select: {
        id: true,
        username: true,
        isFrozen: true,
      },
    });
  }

  async unfreezeUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (!user.isFrozen) {
      throw new BadRequestException('用户未被冻结');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { isFrozen: false },
      select: {
        id: true,
        username: true,
        isFrozen: true,
      },
    });
  }

  async resetUserPassword(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    this.logger.log(`用户 ${user.username} 的密码已重置`);
    return {
      success: true,
      message: '密码已重置',
      tempPassword,
    };
  }

  async getAllPosts(skip: number = 0, take: number = 20) {
    return this.prisma.moment.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        },
        momentlike: { select: { userId: true } },
        momentcomment: { select: { id: true } },
      },
    });
  }

  async deletePost(postId: number) {
    const post = await this.prisma.moment.findUnique({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException('内容不存在');
    }

    return this.prisma.moment.delete({ where: { id: postId } });
  }

  async getAllArticles(skip: number = 0, take: number = 20) {
    return this.prisma.article.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        },
        articlelike: { select: { userId: true } },
        articlecomment: { select: { id: true } },
      },
    });
  }

  async deleteArticle(articleId: number) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw new NotFoundException('文章不存在');
    }

    return this.prisma.article.delete({ where: { id: articleId } });
  }

  async getStatistics() {
    const userCount = await this.prisma.user.count();
    const articleCount = await this.prisma.article.count();
    const momentCount = await this.prisma.moment.count();
    const circleCount = await this.prisma.circle.count();
    const messageCount = await this.prisma.message.count();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayUsers = await this.prisma.user.count({
      where: { createdAt: { gte: today } },
    });

    const todayArticles = await this.prisma.article.count({
      where: { createdAt: { gte: today } },
    });

    const todayMoments = await this.prisma.moment.count({
      where: { createdAt: { gte: today } },
    });

    return {
      totalUsers: userCount,
      totalPosts: momentCount,
      totalArticles: articleCount,
      totalCircles: circleCount,
      totalMessages: messageCount,
      todayUsers,
      todayPosts: todayMoments,
      todayArticles,
      activeUsers: await this.getActiveUsers(),
    };
  }

  private async getActiveUsers() {
    const activeUsers = await this.prisma.user.count({
      where: {
        OR: [
          { article: { some: {} } },
          { moment: { some: {} } },
        ],
      },
    });
    return activeUsers;
  }

  async getPostingStats(days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const rawArticles = await this.prisma.article.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      select: { createdAt: true },
    });

    const rawMoments = await this.prisma.moment.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      select: { createdAt: true },
    });

    return {
      totalArticles: rawArticles.length,
      totalMoments: rawMoments.length,
      dailyStats: this.groupByDate(rawArticles, rawMoments, days),
    };
  }

  private groupByDate(articles: any[], moments: any[], days: number) {
    const now = new Date();

    const articleCounts = new Map<string, number>();
    const momentCounts = new Map<string, number>();

    for (const a of articles) {
      const dateStr = a.createdAt.toISOString().split('T')[0];
      articleCounts.set(dateStr, (articleCounts.get(dateStr) || 0) + 1);
    }
    for (const m of moments) {
      const dateStr = m.createdAt.toISOString().split('T')[0];
      momentCounts.set(dateStr, (momentCounts.get(dateStr) || 0) + 1);
    }

    const result: { date: string; articles: number; moments: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      result.push({
        date: dateStr,
        articles: articleCounts.get(dateStr) || 0,
        moments: momentCounts.get(dateStr) || 0,
      });
    }

    return result;
  }

  async getInteractionStats() {
    const articleLikes = await this.prisma.articlelike.count();
    const momentLikes = await this.prisma.momentlike.count();
    const totalLikes = articleLikes + momentLikes;
    
    const articleComments = await this.prisma.articlecomment.count();
    const momentComments = await this.prisma.momentcomment.count();
    const totalComments = articleComments + momentComments;
    
    const totalMessages = await this.prisma.message.count();
    const totalInteractions = totalLikes + totalComments + totalMessages;

    return {
      totalLikes,
      totalComments,
      totalMessages,
      totalInteractions,
    };
  }

  async getReports(
    skip: number = 0,
    take: number = 20,
    status?: string,
    type?: string,
  ) {
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    return this.prisma.report.findMany({
      skip,
      take,
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }).then(reports => reports.map(r => ({
      ...r,
      reporterId: r.reporterId,
      reporter: {
        id: r.user.id,
        username: r.user.username,
        nickname: r.user.nickname,
        avatarCid: r.user.avatarCid,
      },
      user: undefined,
    })));
  }

  async updateReportStatus(reportId: number, status: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('举报记录不存在');
    }

    return this.prisma.report.update({
      where: { id: reportId },
      data: { status, updatedAt: new Date() },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async createAdmin(data: { username: string; password: string }) {
    const existingUser = await this.prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existingUser) {
      throw new ConflictException('用户名已被占用');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const admin = await this.prisma.user.create({
      data: {
        username: data.username,
        password: hashedPassword,
        isAdmin: true,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        isAdmin: true,
        createdAt: true,
      },
    });

    this.logger.log(`新管理员账号已创建: ${data.username}`);
    return admin;
  }

  async promoteToAdmin(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (user.isAdmin) {
      throw new BadRequestException('该用户已经是管理员');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isAdmin: true, updatedAt: new Date() },
      select: {
        id: true,
        username: true,
        isAdmin: true,
        updatedAt: true,
      },
    });

    this.logger.log(`用户 ${user.username} 已被提升为管理员`);
    return updated;
  }

  async demoteAdmin(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (!user.isAdmin) {
      throw new BadRequestException('该用户不是管理员');
    }

    const adminCount = await this.prisma.user.count({
      where: { isAdmin: true },
    });

    if (adminCount <= 1) {
      throw new BadRequestException('系统中至少需要保留一个管理员');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isAdmin: false, updatedAt: new Date() },
      select: {
        id: true,
        username: true,
        isAdmin: true,
        updatedAt: true,
      },
    });

    this.logger.log(`管理员 ${user.username} 已被降级为普通用户`);
    return updated;
  }

  async createReport(
    type: string,
    targetId: number,
    reason: string,
    description: string | undefined,
    reporterId: number,
  ) {
    return this.prisma.report.create({
      data: {
        type,
        targetId,
        reason,
        description,
        reporterId,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        type: true,
        targetId: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    });
  }
}
