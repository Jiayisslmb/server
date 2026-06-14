import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/config/prisma.service';
import { RedisService } from 'src/config/redis.service';

@Injectable()
export class TopicsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async recordSearch(keyword: string) {
    const today = new Date().toISOString().split('T')[0];
    const key = `search:${today}:${keyword.toLowerCase()}`;

    const count = await this.redis.increment(key);
    await this.redis.expire(key, 86400 * 7);

    return { keyword, count };
  }

  async getTrendingTopics(limit: number = 10) {
    const topics = await this.prisma.topic.findMany({
      where: {
        postCount: { gt: 0 },
      },
      orderBy: [
        { postCount: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: limit,
    });

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const topicsWithGrowth = await Promise.all(topics.map(async (t) => {
      let growth = 0;
      try {
        const todayKey = `search:${today}:${t.name.toLowerCase()}`;
        const yesterdayKey = `search:${yesterdayStr}:${t.name.toLowerCase()}`;
        const todayCount = parseInt(await this.redis.get(todayKey) || '0');
        const yesterdayCount = parseInt(await this.redis.get(yesterdayKey) || '0');

        if (yesterdayCount > 0) {
          growth = Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);
        } else if (todayCount > 0) {
          growth = 100;
        }
      } catch (err) {
        console.error('计算话题增长趋势失败:', err);
      }

      return {
        id: t.id.toString(),
        name: t.name,
        count: t.postCount,
        postCount: t.postCount,
        description: t.description,
        createdAt: t.createdAt,
        growth,
      };
    }));

    return topicsWithGrowth;
  }

  async getHotSearches(limit: number = 10) {
    const today = new Date().toISOString().split('T')[0];
    const pattern = `search:${today}:*`;

    let keys: string[] = [];
    try {
      keys = await this.redis.getKeys(pattern);
    } catch (err) {
      console.error('获取热搜Redis键失败:', err);
      return [];
    }

    const searchItems: Array<{ keyword: string; searchCount: number }> = [];

    for (const key of keys) {
      try {
        const count = await this.redis.get(key);
        const keyword = key.split(':').pop();
        if (keyword && count) {
          searchItems.push({ keyword, searchCount: parseInt(count) });
        }
      } catch (err) {
        console.error('获取搜索计数失败:', err);
      }
    }

    searchItems.sort((a, b) => b.searchCount - a.searchCount);

    const topSearches = searchItems.slice(0, limit);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayPattern = `search:${yesterday.toISOString().split('T')[0]}:*`;

    let yesterdayKeys: string[] = [];
    try {
      yesterdayKeys = await this.redis.getKeys(yesterdayPattern);
    } catch (err) {
      console.error('获取昨日搜索数据失败:', err);
    }

    const yesterdayCounts = new Map<string, number>();
    for (const key of yesterdayKeys) {
      try {
        const count = await this.redis.get(key);
        const keyword = key.split(':').pop();
        if (keyword && count) {
          yesterdayCounts.set(keyword.toLowerCase(), parseInt(count));
        }
      } catch (err) {
        console.error('获取昨日搜索计数失败:', err);
      }
    }

    return topSearches.map((item, index) => {
      const yesterdayCount = yesterdayCounts.get(item.keyword.toLowerCase()) || 0;
      let growth = 0;
      if (yesterdayCount > 0) {
        growth = Math.round(((item.searchCount - yesterdayCount) / yesterdayCount) * 100);
      } else if (item.searchCount > 0) {
        growth = 100;
      }

      return {
        id: index + 1,
        keyword: item.keyword,
        searchCount: item.searchCount,
        rank: index + 1,
        isHot: item.searchCount >= 5,
        isNew: yesterdayCount === 0 && item.searchCount > 0,
        growth,
      };
    });
  }

  async getHotTopics(threshold: number = 1) {
    const today = new Date().toISOString().split('T')[0];
    const pattern = `search:${today}:*`;

    let keys: string[] = [];
    try {
      keys = await this.redis.getKeys(pattern);
    } catch (err) {
      console.error('获取Redis键失败:', err);
      return [];
    }

    const hotTopics: Array<{ name: string; count: number }> = [];

    for (const key of keys) {
      try {
        const count = await this.redis.get(key);
        const keyword = key.split(':').pop();
        if (keyword && count && parseInt(count) >= threshold) {
          hotTopics.push({ name: keyword, count: parseInt(count) });
        }
      } catch (err) {
        console.error('获取搜索计数失败:', err);
      }
    }

    hotTopics.sort((a, b) => b.count - a.count);

    const topicsWithPostCount = await Promise.all(
      hotTopics.map(async (t) => {
        const dbTopic = await this.prisma.topic.findUnique({
          where: { name: t.name },
          select: { id: true, postCount: true, description: true, createdAt: true },
        });
        return {
          id: dbTopic?.id?.toString() || t.name,
          name: t.name,
          count: t.count,
          postCount: dbTopic?.postCount || 0,
          description: dbTopic?.description || null,
          createdAt: dbTopic?.createdAt || null,
        };
      })
    );

    return topicsWithPostCount;
  }

  async createTopic(name: string, description?: string) {
    const reservedWords = ['search', 'hot', 'trending', 'hot-search'];
    if (reservedWords.includes(name.toLowerCase())) {
      throw new ConflictException('话题名称与系统保留关键字冲突，请使用其他名称');
    }

    const existingTopic = await this.prisma.topic.findUnique({
      where: { name },
    });

    if (existingTopic) {
      return existingTopic;
    }

    return this.prisma.topic.create({
      data: {
        name,
        description,
        updatedAt: new Date(),
      },
    });
  }

  async getTopics(skip: number = 0, take: number = 20) {
    return this.prisma.topic.findMany({
      skip,
      take,
      orderBy: [
        { postCount: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async getTopicPosts(topicName: string, skip: number = 0, take: number = 20) {
    const [articles, moments] = await Promise.all([
      this.getTopicArticles(topicName, skip, take),
      this.getTopicMoments(topicName, skip, take),
    ]);

    const allPosts = [
      ...articles.map(a => ({ ...a, type: 'article' as const })),
      ...moments.map(m => ({ ...m, type: 'moment' as const })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return allPosts.slice(skip, skip + take);
  }

  async searchTopics(keyword: string, skip: number = 0, take: number = 20) {
    return this.prisma.topic.findMany({
      where: {
        name: {
          contains: keyword,
        },
      },
      skip,
      take,
      orderBy: [
        { postCount: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async getTopicByName(name: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { name },
      select: {
        id: true,
        name: true,
        description: true,
        postCount: true,
        createdAt: true,
      },
    });

    if (!topic) throw new NotFoundException('话题不存在');

    // 拆分为 3 次独立轻量查询，避免单次巨型嵌套查询导致 MySQL 崩溃
    const [articleTopics, momentTopics] = await Promise.all([
      this.prisma.articletopic.findMany({
        where: { topicId: topic.id },
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          article: {
            include: {
              user: {
                select: { id: true, username: true, nickname: true, avatarCid: true },
              },
              circle: {
                select: { id: true, name: true },
              },
              _count: {
                select: { articlelike: true, articlecomment: true, articlerepost: true },
              },
            },
          },
        },
      }),
      this.prisma.momenttopic.findMany({
        where: { topicId: topic.id },
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          moment: {
            include: {
              user: {
                select: { id: true, username: true, nickname: true, avatarCid: true },
              },
              _count: {
                select: { momentlike: true, momentcomment: true, momentrepost: true },
              },
            },
          },
        },
      }),
    ]);

    // 后处理：将 _count 映射为类数组以保持客户端兼容（客户端使用 .length）
    return {
      ...topic,
      articletopic: articleTopics.map(at => ({
        ...at,
        article: {
          ...at.article,
          articlelike: new Array(at.article._count.articlelike),
          articlecomment: new Array(at.article._count.articlecomment),
          articlerepost: new Array(at.article._count.articlerepost),
        },
      })),
      momenttopic: momentTopics.map(mt => ({
        ...mt,
        moment: {
          ...mt.moment,
          momentlike: new Array(mt.moment._count.momentlike),
          momentcomment: new Array(mt.moment._count.momentcomment),
          momentrepost: new Array(mt.moment._count.momentrepost),
        },
      })),
    };
  }

  async getTopicArticles(topicName: string, skip: number = 0, take: number = 20) {
    const topic = await this.prisma.topic.findUnique({
      where: { name: topicName },
    });

    if (!topic) {
      return [];
    }

    const articleTopics = await this.prisma.articletopic.findMany({
      where: { topicId: topic.id },
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
            circle: {
              select: {
                id: true,
                name: true,
              },
            },
            _count: {
              select: { articlelike: true, articlecomment: true, articlerepost: true },
            },
          },
        },
      },
    });

    return articleTopics.map(at => ({
      ...at.article,
      likes: at.article._count.articlelike,
      comments: at.article._count.articlecomment,
      shares: at.article._count.articlerepost,
    }));
  }

  async getTopicMoments(topicName: string, skip: number = 0, take: number = 20) {
    const topic = await this.prisma.topic.findUnique({
      where: { name: topicName },
    });

    if (!topic) {
      return [];
    }

    const momentTopics = await this.prisma.momenttopic.findMany({
      where: { topicId: topic.id },
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
            _count: {
              select: { momentlike: true, momentcomment: true, momentrepost: true },
            },
          },
        },
      },
    });

    return momentTopics.map(mt => ({
      ...mt.moment,
      likes: mt.moment._count.momentlike,
      comments: mt.moment._count.momentcomment,
      shares: mt.moment._count.momentrepost,
    }));
  }

  async createOrGetTopics(names: string[]): Promise<string[]> {
    const uniqueNames = [...new Set(names.map(n => n.trim()).filter(Boolean))];
    for (const name of uniqueNames) {
      await this.createTopic(name);
    }
    return uniqueNames;
  }

  async extractAndCreateTopics(content: string): Promise<string[]> {
    const hashtagRegex = /#(\S+)/g;
    const matches = content.match(hashtagRegex);

    if (!matches) {
      return [];
    }

    const topicNames = matches
      .map(match => match.substring(1))
      .filter(name => name.length > 0 && name.length <= 100);

    const uniqueTopics = [...new Set(topicNames)];

    for (const name of uniqueTopics) {
      await this.createTopic(name);
    }

    return uniqueTopics;
  }

  async linkArticleToTopics(articleId: number, topicNames: string[]) {
    for (const name of topicNames) {
      const topic = await this.prisma.topic.findUnique({
        where: { name },
      });

      if (topic) {
        const existing = await this.prisma.articletopic.findUnique({
          where: { articleId_topicId: { articleId, topicId: topic.id } },
        }).catch(() => null);

        if (!existing) {
          await this.prisma.articletopic.create({
            data: {
              articleId,
              topicId: topic.id,
            },
          });

          await this.prisma.topic.update({
            where: { id: topic.id },
            data: {
              postCount: { increment: 1 },
              updatedAt: new Date(),
            },
          });
        }
      }
    }
  }

  async linkMomentToTopics(momentId: number, topicNames: string[]) {
    for (const name of topicNames) {
      const topic = await this.prisma.topic.findUnique({
        where: { name },
      });

      if (topic) {
        const existing = await this.prisma.momenttopic.findUnique({
          where: { momentId_topicId: { momentId, topicId: topic.id } },
        }).catch(() => null);

        if (!existing) {
          await this.prisma.momenttopic.create({
            data: {
              momentId,
              topicId: topic.id,
            },
          });

          await this.prisma.topic.update({
            where: { id: topic.id },
            data: {
              postCount: { increment: 1 },
              updatedAt: new Date(),
            },
          });
        }
      }
    }
  }

  async unlinkArticleFromTopics(articleId: number) {
    const articleTopics = await this.prisma.articletopic.findMany({
      where: { articleId },
    });

    for (const at of articleTopics) {
      await this.prisma.topic.update({
        where: { id: at.topicId },
        data: {
          postCount: { decrement: 1 },
          updatedAt: new Date(),
        },
      });
    }

    await this.prisma.articletopic.deleteMany({
      where: { articleId },
    });
  }

  async unlinkMomentFromTopics(momentId: number) {
    const momentTopics = await this.prisma.momenttopic.findMany({
      where: { momentId },
    });

    for (const mt of momentTopics) {
      await this.prisma.topic.update({
        where: { id: mt.topicId },
        data: {
          postCount: { decrement: 1 },
          updatedAt: new Date(),
        },
      });
    }

    await this.prisma.momenttopic.deleteMany({
      where: { momentId },
    });
  }
}
