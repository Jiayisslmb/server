/**
 * 内容管理服务模块
 *
 * 文件功能说明：
 * - 处理所有与内容相关的业务逻辑（动态Moment和文章Article）
 * - 实现内容的增删改查（CRUD）操作
 * - 管理社交互动功能（点赞、评论、收藏、转发、举报）
 * - 处理话题标签关联
 * - 集成Redis缓存提升性能
 * - 发送系统通知
 *
 * 技术架构：
 * - 框架：NestJS @Injectable() 服务类
 * - 数据库：Prisma ORM (MySQL)
 * - 缓存：Redis (热门帖子缓存)
 * - 依赖注入：使用构造函数注入模式
 *
 * 核心功能模块：
 * ┌─────────────────────────────────────────────────────┐
 * │ 动态管理 (Moment Management)                        │
 * │   - createMoment: 创建动态                          │
 * │   - getMomentFeed: 获取动态流                       │
 * │   - updateMoment: 更新动态                          │
 * │   - deleteMoment: 删除动态                          │
 * ├─────────────────────────────────────────────────────┤
 * │ 文章管理 (Article Management)                       │
 * │   - createArticle: 创建文章                         │
 * │   - getArticles: 获取文章列表                       │
 * │   - getArticleById: 获取文章详情                    │
 * │   - deleteArticle: 删除文章                         │
 * ├─────────────────────────────────────────────────────┤
 * │ 社交互动 (Social Interactions)                      │
 * │   - like/unlike: 点赞/取消点赞                     │
 * │   - comment: 评论/回复                              │
 * │   - collect/uncollect: 收藏/取消收藏               │
 * │   - repost: 转发                                   │
 * │   - report: 举报                                   │
 * ├─────────────────────────────────────────────────────┤
 * │ 用户相关 (User-specific)                            │
 * │   - getUserMoments: 用户动态列表                    │
 * │   - getUserCollections: 用户收藏列表                │
 * │   - getUserLikedContent: 用户点赞内容              │
 * └─────────────────────────────────────────────────────┘
 *
 * 性能优化策略：
 * 1. Redis缓存：热门帖子缓存5分钟
 * 2. 分页查询：支持skip/take分页参数
 * 3. 批量查询：使用include减少数据库往返
 * 4. 延迟加载：按需加载关联数据
 *
 * 安全性考虑：
 * - 权限验证：确保用户只能操作自己的内容
 * - 输入验证：DTO验证防止SQL注入和XSS攻击
 * - 事务处理：关键操作使用事务保证数据一致性
 *
 * @module ContentService
 * @version 2.0.0
 * @requires PrismaService 数据库服务
 * @requires RedisService 缓存服务
 * @requires TopicsService 话题服务
 * @requires NotificationService 通知服务
 */

// 内容服务（处理 Moment 动态和 Article 文章相关业务逻辑）

import { Injectable, NotFoundException, UnauthorizedException, ConflictException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from 'src/config/prisma.service';
import { RedisService } from 'src/config/redis.service';
import { CreateMomentDto, CreateArticleDto, UpdateMomentDto } from './dto';
import { TopicsService } from '../topics/topics.service';
import { NotificationService } from '../notification/notification.service';

/**
 * 内容服务类
 *
 * @class ContentService
 * @description 核心业务逻辑层，处理所有内容相关的操作
 * 使用依赖注入模式获取所需的服务实例
 */
@Injectable()
export class ContentService {
  /**
   * 构造函数 - 依赖注入
   *
   * @constructor
   * @param {PrismaService} prisma - Prisma数据库客户端
   * @param {RedisService} redis - Redis缓存客户端
   * @param {TopicsService} topicsService - 话题标签服务
   * @param {NotificationService} notificationService - 通知服务（前向引用解决循环依赖）
   *
   * @note 使用forwardRef解决循环依赖问题：
   *       ContentService → NotificationService → ContentService
   */
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private topicsService: TopicsService,
    @Inject(forwardRef(() => NotificationService))
    private notificationService: NotificationService,
  ) {}

  // ==================== Moment 动态相关 ====================

  async createMoment(userId: number, createMomentDto: CreateMomentDto) {
    const mediaCid = createMomentDto.mediaCid || createMomentDto.mediaUrl || null;

    const moment = await this.prisma.moment.create({
      data: {
        content: createMomentDto.content,
        mediaCid: mediaCid,
        visibility: createMomentDto.visibility || 'public',
        authorId: userId,
        updatedAt: new Date(),
      },
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
    });

    await this.redis.getClient().del('hot_posts');

    try {
      const tagNames = createMomentDto.tags
        ? createMomentDto.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];
      if (tagNames.length > 0) {
        const topicNames = await this.topicsService.createOrGetTopics(tagNames);
        await this.topicsService.linkMomentToTopics(moment.id, topicNames);
      }
    } catch (err) {
      console.error('关联话题失败:', err);
    }

    return {
      ...moment,
      author: moment.user,
      likes: 0,
      comments: 0,
    };
  }

  async getMomentFeed(userId: number, skip: number = 0, take: number = 20) {
    if (skip === 0 && userId) {
      const cachedPosts = await this.redis.getHotPosts();
      if (cachedPosts && cachedPosts.length > 0) {
        return cachedPosts;
      }
    }

    const moments = await this.prisma.moment.findMany({
      where: { visibility: 'public' },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
        momentlike: { select: { userId: true } },
        momentcomment: { select: { id: true } },
        momentrepost: { select: { id: true } },
      },
    });

    const result = moments.map(m => ({
      ...m,
      author: m.user,
      likes: m.momentlike.length,
      comments: m.momentcomment.length,
      shares: m.momentrepost.length,
    }));

    if (skip === 0 && result.length > 0) {
      await this.redis.cacheHotPosts(result, 300);
    }

    return result;
  }

  async getPostFeed(userId: number, skip: number = 0, take: number = 20) {
    return this.getMomentFeed(userId, skip, take);
  }

  async getMomentById(momentId: number, userId?: number) {
    const moment = await this.prisma.moment.findUnique({
      where: { id: momentId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
        momentlike: { select: { userId: true } },
        momentcomment: {
          orderBy: { createdAt: 'desc' },
        },
        momentrepost: { select: { id: true } },
      },
    });

    if (!moment) {
      throw new NotFoundException('动态不存在');
    }

    if (moment.visibility === 'followers' && userId) {
      const isFollower = await this.isFollower(moment.authorId, userId);
      if (!isFollower && moment.authorId !== userId) {
        throw new ForbiddenException('该动态仅对关注者可见');
      }
    }

    if (moment.visibility === 'private' && userId !== moment.authorId) {
      throw new ForbiddenException('该动态为私密内容');
    }

    return {
      ...moment,
      author: moment.user,
      likes: moment.momentlike.length,
      comments: moment.momentcomment.length,
      shares: moment.momentrepost.length,
      isLiked: userId ? moment.momentlike.some(like => like.userId === userId) : false,
    };
  }

  async getUserMoments(userId: number, viewerId?: number, skip: number = 0, take: number = 20) {
    const where: any = { authorId: userId };

    if (viewerId && viewerId !== userId) {
      const isFollower = await this.isFollower(userId, viewerId);
      if (isFollower) {
        where.OR = [
          { visibility: 'public', authorId: userId },
          { visibility: 'followers', authorId: userId },
        ];
        delete where.authorId;
      } else {
        where.OR = [
          { visibility: 'public', authorId: userId },
        ];
        delete where.authorId;
      }
    }

    const moments = await this.prisma.moment.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
        momentlike: { select: { userId: true } },
        momentcomment: { select: { id: true } },
        momentrepost: { select: { id: true } },
      },
    });

    return moments.map(m => ({
      ...m,
      author: m.user,
      likes: m.momentlike.length,
      comments: m.momentcomment.length,
      shares: m.momentrepost.length,
    }));
  }

  async getUserPosts(userId: number, skip: number = 0, take: number = 20) {
    return this.getUserMoments(userId, undefined, skip, take);
  }

  async updateMoment(postId: number, userId: number, updateMomentDto: UpdateMomentDto) {
    const moment = await this.prisma.moment.findUnique({ where: { id: postId } });

    if (!moment) {
      throw new NotFoundException('动态不存在');
    }

    if (moment.authorId !== userId) {
      throw new UnauthorizedException('无权修改此动态');
    }

    return this.prisma.moment.update({
      where: { id: postId },
      data: {
        content: updateMomentDto.content,
        mediaCid: updateMomentDto.mediaCid,
        visibility: updateMomentDto.visibility,
        updatedAt: new Date(),
      },
    });
  }

  async deleteMoment(postId: number, userId: number) {
    const moment = await this.prisma.moment.findUnique({ where: { id: postId } });

    if (!moment) {
      throw new NotFoundException('动态不存在');
    }

    if (moment.authorId !== userId) {
      throw new UnauthorizedException('无权删除此动态');
    }

    try {
      await this.topicsService.unlinkMomentFromTopics(postId);
    } catch (err) {
      console.error('取消话题关联失败:', err);
    }

    return this.prisma.moment.delete({ where: { id: postId } });
  }

  // ==================== Moment 互动相关 ====================

  async likeMoment(postId: number, userId: number) {
    const moment = await this.prisma.moment.findUnique({ where: { id: postId } });

    if (!moment) {
      throw new NotFoundException('动态不存在');
    }

    const existingLike = await this.prisma.momentlike.findUnique({
      where: { momentId_userId: { momentId: postId, userId } },
    });

    if (existingLike) {
      throw new ConflictException('已经点赞过此动态');
    }

    await this.prisma.momentlike.create({
      data: { momentId: postId, userId },
    });

    // 发送点赞通知
    if (moment.authorId !== userId) {
      try {
        const likeUser = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, nickname: true },
        });
        await this.notificationService.createNotification({
          type: 'like',
          userId: moment.authorId,
          fromUserId: userId,
          momentId: postId,
          postContent: moment.content,
          content: `${likeUser?.nickname || likeUser?.username || '用户'} 赞了你的动态`,
        });
      } catch (err) {
        console.error('发送点赞通知失败:', err);
      }
    }

    const likes = await this.prisma.momentlike.count({ where: { momentId: postId } });
    return { success: true, likes };
  }

  async unlikeMoment(postId: number, userId: number) {
    const existingLike = await this.prisma.momentlike.findUnique({
      where: { momentId_userId: { momentId: postId, userId } },
    });

    if (!existingLike) {
      throw new NotFoundException('未点赞此动态');
    }

    await this.prisma.momentlike.delete({
      where: { momentId_userId: { momentId: postId, userId } },
    });

    const likes = await this.prisma.momentlike.count({ where: { momentId: postId } });
    return { success: true, likes };
  }

  async commentOnMoment(postId: number, userId: number, content: string, replyToId?: number) {
    const moment = await this.prisma.moment.findUnique({ where: { id: postId } });

    if (!moment) {
      throw new NotFoundException('动态不存在');
    }

    const comment = await this.prisma.momentcomment.create({
      data: {
        momentId: postId,
        authorId: userId,
        content,
        replyToId: replyToId || null,
      },
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
    });

    // 发送评论通知
    if (moment.authorId !== userId) {
      try {
        const commentUser = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, nickname: true },
        });
        await this.notificationService.createNotification({
          type: 'comment',
          userId: moment.authorId,
          fromUserId: userId,
          momentId: postId,
          postContent: moment.content,
          commentContent: content,
          content: `${commentUser?.nickname || commentUser?.username || '用户'} 评论了你的动态`,
        });
      } catch (err) {
        console.error('发送评论通知失败:', err);
      }
    }

    // 如果是回复其他评论，也给被回复的用户发送通知
    if (replyToId) {
      try {
        const replyToComment = await this.prisma.momentcomment.findUnique({
          where: { id: replyToId },
          select: { authorId: true },
        });
        if (replyToComment && replyToComment.authorId !== userId) {
          const commentUser = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, nickname: true },
          });
          await this.notificationService.createNotification({
            type: 'reply',
            userId: replyToComment.authorId,
            fromUserId: userId,
            momentId: postId,
            postContent: moment.content,
            commentContent: content,
            content: `${commentUser?.nickname || commentUser?.username || '用户'} 回复了你的评论`,
          });
        }
      } catch (err) {
        console.error('发送回复通知失败:', err);
      }
    }

    return comment;
  }

  async getMomentComments(momentId: number, skip: number = 0, take: number = 20) {
    return this.prisma.momentcomment.findMany({
      where: { 
        momentId,
        replyToId: null,  // 只获取主评论，不包括回复
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
        other_momentcomment: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                nickname: true,
                avatarCid: true,
              },
            },
            momentcomment: {
              select: {
                id: true,
                user: {
                  select: {
                    id: true,
                    username: true,
                    nickname: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async getPostComments(postId: number, skip: number = 0, take: number = 20) {
    return this.getMomentComments(postId, skip, take);
  }

  async collectMoment(postId: number, userId: number) {
    const moment = await this.prisma.moment.findUnique({ where: { id: postId } });

    if (!moment) {
      throw new NotFoundException('动态不存在');
    }

    const existingCollection = await this.prisma.momentcollection.findUnique({
      where: { momentId_userId: { momentId: postId, userId } },
    });

    if (existingCollection) {
      throw new ConflictException('已经收藏过此动态');
    }

    await this.prisma.momentcollection.create({
      data: { momentId: postId, userId },
    });

    const collections = await this.prisma.momentcollection.count({ where: { momentId: postId } });
    return { success: true, collections };
  }

  async uncollectMoment(postId: number, userId: number) {
    const existingCollection = await this.prisma.momentcollection.findUnique({
      where: { momentId_userId: { momentId: postId, userId } },
    });

    if (!existingCollection) {
      throw new NotFoundException('未收藏此动态');
    }

    await this.prisma.momentcollection.delete({
      where: { momentId_userId: { momentId: postId, userId } },
    });

    const collections = await this.prisma.momentcollection.count({ where: { momentId: postId } });
    return { success: true, collections };
  }

  async isMomentCollected(postId: number, userId: number) {
    const collection = await this.prisma.momentcollection.findUnique({
      where: { momentId_userId: { momentId: postId, userId } },
    });
    return { isCollected: !!collection };
  }

  async isMomentLiked(postId: number, userId: number) {
    const like = await this.prisma.momentlike.findUnique({
      where: { momentId_userId: { momentId: postId, userId } },
    });
    return { isLiked: !!like };
  }

  async repostMoment(postId: number, userId: number) {
    const moment = await this.prisma.moment.findUnique({
      where: { id: postId },
      include: {
        user: {
          select: { id: true, username: true, nickname: true },
        },
        momenttopic: {
          include: {
            topic: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!moment) {
      throw new NotFoundException('动态不存在');
    }

    if (moment.visibility === 'followers') {
      const isFollower = await this.isFollower(moment.authorId, userId);
      if (!isFollower && moment.authorId !== userId) {
        throw new ForbiddenException('该动态仅对关注者可见，无法转发');
      }
    }

    if (moment.visibility === 'private' && moment.authorId !== userId) {
      throw new ForbiddenException('该动态为私密内容，无法转发');
    }

    const repostUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, nickname: true },
    });

    const repostContent = `转发动态\n「${moment.content.substring(0, 100)}${moment.content.length > 100 ? '...' : ''}」—— @${moment.user.username}`;

    const repostMoment = await this.prisma.moment.create({
      data: {
        content: repostContent,
        visibility: 'public',
        authorId: userId,
        mediaCid: moment.mediaCid,
        updatedAt: new Date(),
      },
    });

    await this.prisma.momentrepost.create({
      data: { momentId: postId, userId },
    });

    try {
      const tagNames = moment.momenttopic
        ? moment.momenttopic.map(mt => mt.topic?.name).filter(Boolean)
        : [];
      if (tagNames.length > 0) {
        const topicNames = await this.topicsService.createOrGetTopics(tagNames);
        await this.topicsService.linkMomentToTopics(repostMoment.id, topicNames);
      }
    } catch (err) {
      console.error('转发关联话题失败:', err);
    }

    if (moment.authorId !== userId) {
      try {
        await this.notificationService.createNotification({
          type: 'system',
          userId: moment.authorId,
          fromUserId: userId,
          momentId: postId,
          content: `${repostUser?.nickname || repostUser?.username || '用户'} 转发了你的动态`,
        });
      } catch (err) {
        console.error('发送转发通知失败:', err);
      }
    }

    await this.redis.getClient().del('hot_posts');

    const reposts = await this.prisma.momentrepost.count({ where: { momentId: postId } });
    return { success: true, reposts, repostMomentId: repostMoment.id };
  }

  async getMomentRepostCount(postId: number) {
    const reposts = await this.prisma.momentrepost.count({ where: { momentId: postId } });
    return { reposts };
  }

  async incrementMomentRepostCount(postId: number, userId: number) {
    const existingRepost = await this.prisma.momentrepost.findFirst({
      where: {
        momentId: postId,
        userId: userId,
      },
    });

    if (!existingRepost) {
      await this.prisma.momentrepost.create({
        data: { momentId: postId, userId },
      });
    }

    await this.redis.getClient().del('hot_posts');

    const reposts = await this.prisma.momentrepost.count({ where: { momentId: postId } });
    return { success: true, reposts };
  }

  async getUserCollections(userId: number, skip: number = 0, take: number = 20) {
    const collections = await this.prisma.momentcollection.findMany({
      where: { userId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        moment: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                nickname: true,
                avatarCid: true,
              },
            },
            momentlike: { select: { userId: true } },
            momentcomment: { select: { id: true } },
            momentrepost: { select: { id: true } },
          },
        },
      },
    });

    return collections.map(c => ({
      ...c.moment,
      author: c.moment.user,
      likes: c.moment.momentlike.length,
      comments: c.moment.momentcomment.length,
      shares: c.moment.momentrepost.length,
      collectedAt: c.createdAt,
    }));
  }

  async getUserMomentLikes(userId: number, skip: number = 0, take: number = 20) {
    const likes = await this.prisma.momentlike.findMany({
      where: { userId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        moment: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                nickname: true,
                avatarCid: true,
              },
            },
            momentlike: { select: { userId: true } },
            momentcomment: { select: { id: true } },
            momentrepost: { select: { id: true } },
          },
        },
      },
    });

    return likes.map(l => ({
      ...l.moment,
      author: l.moment.user,
      likes: l.moment.momentlike.length,
      comments: l.moment.momentcomment.length,
      shares: l.moment.momentrepost.length,
      likedAt: l.createdAt,
    }));
  }

  // ==================== Article 文章相关 ====================

  async createArticle(userId: number, createArticleDto: CreateArticleDto) {
    const article = await this.prisma.article.create({
      data: {
        title: createArticleDto.title,
        content: createArticleDto.content,
        coverCid: createArticleDto.coverCid,
        mediaCid: createArticleDto.coverCid,
        tags: createArticleDto.tags,
        authorId: userId,
        circleId: createArticleDto.circleId,
        updatedAt: new Date(),
      },
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
    });

    try {
      const tagNames = createArticleDto.tags
        ? createArticleDto.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];
      if (tagNames.length > 0) {
        const topicNames = await this.topicsService.createOrGetTopics(tagNames);
        await this.topicsService.linkArticleToTopics(article.id, topicNames);
      }
    } catch (err) {
      console.error('关联话题失败:', err);
    }

    return article;
  }

  async getArticleFeed(userId: number, skip: number = 0, take: number = 20) {
    const articles = await this.prisma.article.findMany({
      where: { visibility: 'public' },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
        circle: {
          select: {
            id: true,
            name: true,
          },
        },
        articlelike: { select: { userId: true } },
        articlecomment: { select: { id: true } },
        articlerepost: { select: { id: true } },
      },
    });

    return articles.map(article => ({
      ...article,
      author: article.user,
      likes: article.articlelike.length,
      comments: article.articlecomment.length,
      shares: article.articlerepost.length,
    }));
  }

  async getArticles(skip: number = 0, take: number = 20) {
    const articles = await this.prisma.article.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
        articlelike: { select: { userId: true } },
        articlecomment: { select: { id: true } },
        articlerepost: { select: { id: true } },
      },
    });

    return articles.map(article => ({
      ...article,
      author: article.user,
      likes: article.articlelike.length,
      comments: article.articlecomment.length,
      shares: article.articlerepost.length,
    }));
  }

  async getArticleById(articleId: number, userId?: number) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
        circle: {
          select: {
            id: true,
            name: true,
          },
        },
        articlelike: { select: { userId: true } },
        articlecomment: { orderBy: { createdAt: 'desc' } },
        articlerepost: { select: { id: true } },
      },
    });

    if (!article) {
      throw new NotFoundException('文章不存在');
    }

    if (article.visibility === 'followers' && userId) {
      const isFollower = await this.isFollower(article.authorId, userId);
      if (!isFollower && article.authorId !== userId) {
        throw new ForbiddenException('该文章仅对关注者可见');
      }
    }

    if (article.visibility === 'private' && userId !== article.authorId) {
      throw new ForbiddenException('该文章为私密内容');
    }

    return {
      ...article,
      author: article.user,
      likes: article.articlelike.length,
      comments: article.articlecomment.length,
      shares: article.articlerepost.length,
      isLiked: userId ? article.articlelike.some(like => like.userId === userId) : false,
    };
  }

  async getUserArticles(userId: number, viewerId?: number, skip: number = 0, take: number = 20) {
    const where: any = { authorId: userId };

    if (viewerId && viewerId !== userId) {
      const isFollower = await this.isFollower(userId, viewerId);
      if (isFollower) {
        where.OR = [
          { visibility: 'public', authorId: userId },
          { visibility: 'followers', authorId: userId },
        ];
        delete where.authorId;
      } else {
        where.OR = [
          { visibility: 'public', authorId: userId },
        ];
        delete where.authorId;
      }
    }

    const articles = await this.prisma.article.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
        circle: {
          select: {
            id: true,
            name: true,
          },
        },
        articlelike: { select: { userId: true } },
        articlecomment: { select: { id: true } },
        articlerepost: { select: { id: true } },
      },
    });

    return articles.map(article => ({
      ...article,
      author: article.user,
      likes: article.articlelike.length,
      comments: article.articlecomment.length,
      shares: article.articlerepost.length,
    }));
  }

  async updateArticle(articleId: number, userId: number, updateData: Partial<CreateArticleDto>) {
    const article = await this.prisma.article.findUnique({ where: { id: articleId } });

    if (!article) {
      throw new NotFoundException('文章不存在');
    }

    if (article.authorId !== userId) {
      throw new UnauthorizedException('无权修改此文章');
    }

    return this.prisma.article.update({
      where: { id: articleId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });
  }

  async deleteArticle(articleId: number, userId: number) {
    const article = await this.prisma.article.findUnique({ where: { id: articleId } });

    if (!article) {
      throw new NotFoundException('文章不存在');
    }

    if (article.authorId !== userId) {
      throw new UnauthorizedException('无权删除此文章');
    }

    try {
      await this.topicsService.unlinkArticleFromTopics(articleId);
    } catch (err) {
      console.error('取消话题关联失败:', err);
    }

    return this.prisma.article.delete({ where: { id: articleId } });
  }

  // ==================== Article 互动相关 ====================

  async likeArticle(articleId: number, userId: number) {
    const article = await this.prisma.article.findUnique({ where: { id: articleId } });

    if (!article) {
      throw new NotFoundException('文章不存在');
    }

    const existingLike = await this.prisma.articlelike.findUnique({
      where: { articleId_userId: { articleId, userId } },
    });

    if (existingLike) {
      throw new ConflictException('已经点赞过此文章');
    }

    await this.prisma.articlelike.create({
      data: { articleId, userId },
    });

    // 发送点赞通知
    if (article.authorId !== userId) {
      try {
        const likeUser = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, nickname: true },
        });
        await this.notificationService.createNotification({
          type: 'like',
          userId: article.authorId,
          fromUserId: userId,
          articleId: articleId,
          postContent: article.content,
          content: `${likeUser?.nickname || likeUser?.username || '用户'} 赞了你的文章${article.title ? `「${article.title}」` : ''}`,
        });
      } catch (err) {
        console.error('发送点赞通知失败:', err);
      }
    }

    const likes = await this.prisma.articlelike.count({ where: { articleId } });
    return { success: true, likes };
  }

  async unlikeArticle(articleId: number, userId: number) {
    const existingLike = await this.prisma.articlelike.findUnique({
      where: { articleId_userId: { articleId, userId } },
    });

    if (!existingLike) {
      throw new NotFoundException('未点赞此文章');
    }

    await this.prisma.articlelike.delete({
      where: { articleId_userId: { articleId, userId } },
    });

    const likes = await this.prisma.articlelike.count({ where: { articleId } });
    return { success: true, likes };
  }

  async commentOnArticle(articleId: number, userId: number, content: string, replyToId?: number) {
    const article = await this.prisma.article.findUnique({ where: { id: articleId } });

    if (!article) {
      throw new NotFoundException('文章不存在');
    }

    const comment = await this.prisma.articlecomment.create({
      data: {
        articleId,
        authorId: userId,
        content,
        replyToId: replyToId || null,
      },
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
    });

    // 发送评论通知
    if (article.authorId !== userId) {
      try {
        const commentUser = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, nickname: true },
        });
        await this.notificationService.createNotification({
          type: 'comment',
          userId: article.authorId,
          fromUserId: userId,
          articleId: articleId,
          postContent: article.content,
          commentContent: content,
          content: `${commentUser?.nickname || commentUser?.username || '用户'} 评论了你的文章${article.title ? `「${article.title}」` : ''}`,
        });
      } catch (err) {
        console.error('发送评论通知失败:', err);
      }
    }

    // 如果是回复其他评论，也给被回复的用户发送通知
    if (replyToId) {
      try {
        const replyToComment = await this.prisma.articlecomment.findUnique({
          where: { id: replyToId },
          select: { authorId: true },
        });
        if (replyToComment && replyToComment.authorId !== userId) {
          const commentUser = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, nickname: true },
          });
          await this.notificationService.createNotification({
            type: 'reply',
            userId: replyToComment.authorId,
            fromUserId: userId,
            articleId: articleId,
            postContent: article.content,
            commentContent: content,
            content: `${commentUser?.nickname || commentUser?.username || '用户'} 回复了你的评论`,
          });
        }
      } catch (err) {
        console.error('发送回复通知失败:', err);
      }
    }

    return comment;
  }

  async getArticleComments(articleId: number, skip: number = 0, take: number = 20) {
    return this.prisma.articlecomment.findMany({
      where: { 
        articleId,
        replyToId: null,  // 只获取主评论，不包括回复
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
        other_articlecomment: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                nickname: true,
                avatarCid: true,
              },
            },
            articlecomment: {
              select: {
                id: true,
                user: {
                  select: {
                    id: true,
                    username: true,
                    nickname: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async collectArticle(articleId: number, userId: number) {
    const article = await this.prisma.article.findUnique({ where: { id: articleId } });

    if (!article) {
      throw new NotFoundException('文章不存在');
    }

    const existingCollection = await this.prisma.articlecollection.findUnique({
      where: { articleId_userId: { articleId, userId } },
    });

    if (existingCollection) {
      throw new ConflictException('已经收藏过此文章');
    }

    await this.prisma.articlecollection.create({
      data: { articleId, userId },
    });

    const collections = await this.prisma.articlecollection.count({ where: { articleId } });
    return { success: true, collections };
  }

  async uncollectArticle(articleId: number, userId: number) {
    const existingCollection = await this.prisma.articlecollection.findUnique({
      where: { articleId_userId: { articleId, userId } },
    });

    if (!existingCollection) {
      throw new NotFoundException('未收藏此文章');
    }

    await this.prisma.articlecollection.delete({
      where: { articleId_userId: { articleId, userId } },
    });

    const collections = await this.prisma.articlecollection.count({ where: { articleId } });
    return { success: true, collections };
  }

  async isArticleCollected(articleId: number, userId: number) {
    const collection = await this.prisma.articlecollection.findUnique({
      where: { articleId_userId: { articleId, userId } },
    });
    return { isCollected: !!collection };
  }

  async isArticleLiked(articleId: number, userId: number) {
    const like = await this.prisma.articlelike.findUnique({
      where: { articleId_userId: { articleId, userId } },
    });
    return { isLiked: !!like };
  }

  async repostArticle(articleId: number, userId: number) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: {
        user: {
          select: { id: true, username: true, nickname: true },
        },
      },
    });

    if (!article) {
      throw new NotFoundException('文章不存在');
    }

    if (article.visibility === 'followers') {
      const isFollower = await this.isFollower(article.authorId, userId);
      if (!isFollower && article.authorId !== userId) {
        throw new ForbiddenException('该文章仅对关注者可见，无法转发');
      }
    }

    if (article.visibility === 'private' && article.authorId !== userId) {
      throw new ForbiddenException('该文章为私密内容，无法转发');
    }

    const repostUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, nickname: true },
    });

    const repostContent = `转发文章\n「${article.title || article.content.substring(0, 100)}${article.content.length > 100 ? '...' : ''}」—— @${article.user.username}`;

    const repostMoment = await this.prisma.moment.create({
      data: {
        content: repostContent,
        visibility: 'public',
        authorId: userId,
        mediaCid: article.coverCid || article.mediaCid,
        updatedAt: new Date(),
      },
    });

    await this.prisma.articlerepost.create({
      data: { articleId, userId },
    });

    try {
      const tagNames = article.tags
        ? (typeof article.tags === 'string' ? article.tags.split(',').map(t => t.trim()).filter(Boolean) : [])
        : [];
      if (tagNames.length > 0) {
        const topicNames = await this.topicsService.createOrGetTopics(tagNames);
        await this.topicsService.linkMomentToTopics(repostMoment.id, topicNames);
      }
    } catch (err) {
      console.error('转发关联话题失败:', err);
    }

    if (article.authorId !== userId) {
      try {
        await this.notificationService.createNotification({
          type: 'system',
          userId: article.authorId,
          fromUserId: userId,
          articleId: articleId,
          content: `${repostUser?.nickname || repostUser?.username || '用户'} 转发了你的文章${article.title ? `「${article.title}」` : ''}`,
        });
      } catch (err) {
        console.error('发送转发通知失败:', err);
      }
    }

    await this.redis.getClient().del('hot_posts');

    const reposts = await this.prisma.articlerepost.count({ where: { articleId } });
    return { success: true, reposts, repostMomentId: repostMoment.id };
  }

  async getArticleRepostCount(articleId: number) {
    const reposts = await this.prisma.articlerepost.count({ where: { articleId } });
    return { reposts };
  }

  async incrementArticleRepostCount(articleId: number, userId: number) {
    const existingRepost = await this.prisma.articlerepost.findFirst({
      where: {
        articleId: articleId,
        userId: userId,
      },
    });

    if (!existingRepost) {
      await this.prisma.articlerepost.create({
        data: { articleId, userId },
      });
    }

    await this.redis.getClient().del('hot_posts');

    const reposts = await this.prisma.articlerepost.count({ where: { articleId } });
    return { success: true, reposts };
  }

  async getUserArticleLikes(userId: number, skip: number = 0, take: number = 20) {
    const likes = await this.prisma.articlelike.findMany({
      where: { userId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        article: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                nickname: true,
                avatarCid: true,
              },
            },
            articlelike: { select: { userId: true } },
            articlecomment: { select: { id: true } },
            articlerepost: { select: { id: true } },
            circle: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return likes.map(l => ({
      ...l.article,
      author: l.article.user,
      likes: l.article.articlelike.length,
      comments: l.article.articlecomment.length,
      likedAt: l.createdAt,
    }));
  }

  async getUserReceivedMomentLikes(userId: number, skip: number = 0, take: number = 20) {
    const moments = await this.prisma.moment.findMany({
      where: { authorId: userId },
      select: { id: true },
    });
    const momentIds = moments.map(m => m.id);

    const likes = await this.prisma.momentlike.findMany({
      where: { momentId: { in: momentIds } },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        moment: {
          select: {
            id: true,
            content: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
      },
    });

    return likes.map(l => ({
      momentId: l.momentId,
      moment: l.moment,
      user: l.user,
      createdAt: l.createdAt,
    }));
  }

  async getUserMomentCollections(userId: number, skip: number = 0, take: number = 20) {
    const collections = await this.prisma.momentcollection.findMany({
      where: { userId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        moment: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                nickname: true,
                avatarCid: true,
              },
            },
            momentlike: { select: { userId: true } },
            momentcomment: { select: { id: true } },
          },
        },
      },
    });

    return collections.map(c => ({
      ...c.moment,
      author: c.moment.user,
      likes: c.moment.momentlike.length,
      comments: c.moment.momentcomment.length,
      collectedAt: c.createdAt,
    }));
  }

  async getUserArticleCollections(userId: number, skip: number = 0, take: number = 20) {
    const collections = await this.prisma.articlecollection.findMany({
      where: { userId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        article: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                nickname: true,
                avatarCid: true,
              },
            },
            articlelike: { select: { userId: true } },
            articlecomment: { select: { id: true } },
            articlerepost: { select: { id: true } },
            circle: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return collections.map(c => ({
      ...c.article,
      author: c.article.user,
      likes: c.article.articlelike.length,
      comments: c.article.articlecomment.length,
      shares: c.article.articlerepost.length,
      collectedAt: c.createdAt,
    }));
  }

  async getUserReceivedArticleLikes(userId: number, skip: number = 0, take: number = 20) {
    const articles = await this.prisma.article.findMany({
      where: { authorId: userId },
      select: { id: true },
    });
    const articleIds = articles.map(a => a.id);

    const likes = await this.prisma.articlelike.findMany({
      where: { articleId: { in: articleIds } },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        article: {
          select: {
            id: true,
            title: true,
            content: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
      },
    });

    return likes.map(l => ({
      articleId: l.articleId,
      article: l.article,
      user: l.user,
      createdAt: l.createdAt,
    }));
  }

  async searchContent(query: string, type?: string, skip: number = 0, take: number = 20) {
    const results: any[] = [];

    if (!type || type === 'moment') {
      const moments = await this.prisma.moment.findMany({
        where: {
          content: { contains: query },
          visibility: 'public',
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, username: true, nickname: true, avatarCid: true },
          },
          momentlike: { select: { userId: true } },
          momentcomment: { select: { id: true } },
          momentrepost: { select: { id: true } },
          momenttopic: {
            include: {
              topic: { select: { name: true } },
            },
          },
        },
      });

      results.push(...moments.map(m => ({
        id: m.id,
        type: 'moment',
        content: m.content,
        mediaCid: m.mediaCid,
        createdAt: m.createdAt,
        author: m.user,
        likes: m.momentlike.length,
        comments: m.momentcomment.length,
        shares: m.momentrepost.length,
        visibility: m.visibility,
        tags: m.momenttopic ? m.momenttopic.map((mt: any) => mt.topic.name) : [],
      })));
    }

    if (!type || type === 'article') {
      const articles = await this.prisma.article.findMany({
        where: {
          OR: [
            { title: { contains: query } },
            { content: { contains: query } },
          ],
          visibility: 'public',
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, username: true, nickname: true, avatarCid: true },
          },
          articlelike: { select: { userId: true } },
          articlecomment: { select: { id: true } },
          articlerepost: { select: { id: true } },
          circle: { select: { id: true, name: true } },
          articletopic: {
            include: {
              topic: { select: { name: true } },
            },
          },
        },
      });

      results.push(...articles.map(a => ({
        id: a.id,
        type: 'article',
        title: a.title,
        content: a.content,
        coverCid: a.coverCid,
        mediaCid: a.mediaCid,
        createdAt: a.createdAt,
        author: a.user,
        likes: a.articlelike.length,
        comments: a.articlecomment.length,
        shares: a.articlerepost.length,
        circle: a.circle,
        visibility: a.visibility,
        tags: a.articletopic && a.articletopic.length > 0
          ? a.articletopic.map((at: any) => at.topic.name)
          : (a.tags ? (typeof a.tags === 'string' ? a.tags.split(',').filter(Boolean) : a.tags) : []),
      })));
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return results.slice(0, take);
  }

  // ==================== 辅助方法 ====================

  private async isFollower(userId: number, followerId: number): Promise<boolean> {
    const follow = await this.prisma.userfollows.findUnique({
      where: {
        followerId_followingId: {
          followerId: followerId,
          followingId: userId,
        },
      },
    });
    return !!follow;
  }
}
