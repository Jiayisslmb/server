// 圈子服务（处理圈子相关业务逻辑）

import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/config/prisma.service';
import { CreateCircleDto, UpdateCircleDto } from './dto';

@Injectable()
export class CircleService {
  private readonly logger = new Logger(CircleService.name);
  constructor(private prisma: PrismaService) {}

  // 创建圈子
  async createCircle(userId: number, createCircleDto: CreateCircleDto) {
    const circle = await this.prisma.circle.create({
      data: {
        name: createCircleDto.name,
        description: createCircleDto.description,
        avatarCid: createCircleDto.avatarCid,
        category: createCircleDto.category,
        creatorId: userId,
        adminIds: JSON.stringify([userId]), // 创建者自动成为管理员
        updatedAt: new Date(),
      },
    });

    // 创建者自动加入圈子
    await this.prisma.circlemembers.create({
      data: {
        circleId: circle.id,
        userId,
      },
    });

    return this.prisma.circle.findUnique({
      where: { id: circle.id },
      include: {
        circlemembers: true,
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
  }

  // 获取圈子列表
  async getCircles(skip: number = 0, take: number = 20) {
    const circles = await this.prisma.circle.findMany({
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
        _count: {
          select: { circlemembers: true, article: true },
        },
      },
    });

    return circles.map(circle => ({
      ...circle,
      memberCount: circle._count.circlemembers,
      postCount: circle._count.article,
      _count: undefined, // 删除原始 _count
    }));
  }

  // 获取圈子详情
  async getCircleById(circleId: number) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
        circlemembers: {
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
        },
        article: {
          orderBy: { createdAt: 'desc' },
          take: 10,
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
        },
        _count: {
          select: { circlemembers: true, article: true },
        },
      },
    });

    if (!circle) {
      throw new NotFoundException('圈子不存在');
    }

    return {
      ...circle,
      memberCount: circle._count.circlemembers,
      postCount: circle._count.article,
      _count: undefined,
    };
  }

  // 更新圈子信息
  async updateCircle(
    circleId: number,
    userId: number,
    updateCircleDto: UpdateCircleDto,
  ) {
    this.logger.log(`更新圈子 ${circleId}, userId: ${userId}, 数据: ${JSON.stringify(updateCircleDto)}`);

    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
    });

    if (!circle) {
      throw new NotFoundException('圈子不存在');
    }

    const adminIds = JSON.parse(circle.adminIds || '[]');
    if (circle.creatorId !== userId && !adminIds.includes(userId)) {
      throw new UnauthorizedException('无权修改此圈子');
    }

    const updateData: any = { updatedAt: new Date() };
    if (updateCircleDto.name !== undefined) updateData.name = updateCircleDto.name;
    if (updateCircleDto.description !== undefined) updateData.description = updateCircleDto.description;
    if (updateCircleDto.category !== undefined) updateData.category = updateCircleDto.category;
    if (updateCircleDto.avatarCid !== undefined) {
      updateData.avatarCid = updateCircleDto.avatarCid || null;
    }
    this.logger.log(`实际更新数据: ${JSON.stringify(updateData)}`);

    const result = await this.prisma.circle.update({
      where: { id: circleId },
      data: updateData,
    });

    this.logger.log(`更新后圈子 avatarCid: ${result.avatarCid}`);
    return result;
  }

  // 删除圈子
  async deleteCircle(circleId: number, userId: number) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
    });

    if (!circle) {
      throw new NotFoundException('圈子不存在');
    }

    if (circle.creatorId !== userId) {
      throw new UnauthorizedException('只有创建者可以删除圈子');
    }

    return this.prisma.circle.delete({ where: { id: circleId } });
  }

  // 加入圈子
  async joinCircle(circleId: number, userId: number) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
    });

    if (!circle) {
      throw new NotFoundException('圈子不存在');
    }

    const existingMember = await this.prisma.circlemembers.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });

    if (existingMember) {
      return { success: true, alreadyJoined: true, message: '已加入此圈子' };
    }

    await this.prisma.circlemembers.create({
      data: { circleId, userId },
    });
    
    return { success: true, alreadyJoined: false, message: '加入成功' };
  }

  // 离开圈子
  async leaveCircle(circleId: number, userId: number) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
    });

    if (!circle) {
      throw new NotFoundException('圈子不存在');
    }

    if (circle.creatorId === userId) {
      throw new ConflictException('创建者不能离开圈子，请先删除圈子');
    }

    const member = await this.prisma.circlemembers.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });

    if (!member) {
      return { success: true, alreadyLeft: true, message: '未加入此圈子' };
    }

    await this.prisma.circlemembers.delete({
      where: { circleId_userId: { circleId, userId } },
    });
    
    return { success: true, alreadyLeft: false, message: '离开成功' };
  }

  // 获取圈子成员
  async getCircleMembers(circleId: number, skip: number = 0, take: number = 20) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
    });

    if (!circle) {
      throw new NotFoundException('圈子不存在');
    }

    return this.prisma.circlemembers.findMany({
      where: { circleId },
      skip,
      take,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // 获取用户加入的圈子
  async getUserCircles(userId: number, skip: number = 0, take: number = 20) {
    return this.prisma.circlemembers.findMany({
      where: { userId },
      skip,
      take,
      include: {
        circle: {
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
              select: { circlemembers: true, article: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCirclePosts(circleId: number, skip: number = 0, take: number = 20) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
    });

    if (!circle) {
      throw new NotFoundException('圈子不存在');
    }

    const posts = await this.prisma.article.findMany({
      where: { circleId },
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
      },
    });

    return posts.map(post => ({
      ...post,
      likes: post.articlelike.length,
      comments: post.articlecomment.length,
    }));
  }

  // 查询圈子
  async searchCircles(keyword: string, skip: number = 0, take: number = 20) {
    return this.prisma.circle.findMany({
      where: {
        OR: [
          { name: { contains: keyword } },
          { description: { contains: keyword } },
        ],
      },
      skip,
      take,
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
          select: { circlemembers: true, article: true },
        },
      },
    });
  }
}
