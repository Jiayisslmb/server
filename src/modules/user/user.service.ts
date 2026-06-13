import { Injectable, ConflictException, NotFoundException, ForbiddenException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/config/prisma.service';
import { PrivacyService } from 'src/common/services/privacy.service';
import { AdminSecurityService } from 'src/common/services/admin-security.service';
import { CreateUserDto, LoginDto, UpdateUserDto } from './dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private prisma: PrismaService,
    private privacyService: PrivacyService,
    private adminSecurity: AdminSecurityService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        username: createUserDto.username,
      },
    });

    if (existingUser) {
      throw new ConflictException('用户名已被占用');
    }

    const passwordValidation = await this.adminSecurity.validatePasswordStrength(createUserDto.password);
    if (!passwordValidation.valid) {
      throw new BadRequestException(`密码强度不足: ${passwordValidation.errors.join(', ')}`);
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    return this.prisma.user.create({
      data: {
        username: createUserDto.username,
        password: hashedPassword,
        nickname: createUserDto.nickname || null,
        bio: createUserDto.bio,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarCid: true,
        bio: true,
        isAdmin: true,
        createdAt: true,
      },
    });
  }

  async validateUser(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: loginDto.username },
    });

    if (!user) {
      throw new NotFoundException('用户名或密码错误');
    }

    if (user.isFrozen) {
      throw new ConflictException('账号已被冻结，请联系管理员');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new NotFoundException('用户名或密码错误');
    }

    const { password, ...result } = user;
    return result;
  }

  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarCid: true,
        backgroundCid: true,
        backgroundColor: true,
        globalBackgroundCid: true,
        globalBackgroundColor: true,
        language: true,
        fontSize: true,
        colorScheme: true,
        defaultVisibility: true,
        bio: true,
        isAdmin: true,
        isFrozen: true,
        mfaEnabled: true,
        mfaSecret: true,
        adminDeviceBound: true,
        createdAt: true,
        updatedAt: true,
        allowFollow: true,
        allowMessage: true,
        hideFollowing: true,
        hideFollowers: true,
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  async findByGithubId(githubId: string) {
    return this.prisma.user.findUnique({
      where: { githubId },
      select: {
        id: true,
        username: true,
        isAdmin: true,
        isFrozen: true,
      },
    });
  }

  async checkUsernameExists(username: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return !!user;
  }

  async createFromGitHub(data: {
    githubId: string;
    username: string;
    password: string;
    nickname?: string;
    avatarUrl?: string;
  }) {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.prisma.user.create({
      data: {
        githubId: data.githubId,
        username: data.username,
        password: hashedPassword,
        nickname: data.nickname || null,
        avatarUrl: data.avatarUrl || null,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarUrl: true,
        avatarCid: true,
        bio: true,
        isAdmin: true,
        isFrozen: true,
        createdAt: true,
      },
    });
  }

  async findByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarCid: true,
        backgroundCid: true,
        backgroundColor: true,
        globalBackgroundCid: true,
        globalBackgroundColor: true,
        bio: true,
        isAdmin: true,
        isFrozen: true,
        mfaEnabled: true,
        mfaSecret: true,
        adminDeviceBound: true,
        createdAt: true,
        allowFollow: true,
        allowMessage: true,
        hideFollowing: true,
        hideFollowers: true,
        _count: {
          select: {
            article: true,
            moment: true,
            userfollows_userfollows_followingIdTouser: true,
            userfollows_userfollows_followerIdTouser: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  async findByIdWithPrivacy(viewerId: number | null, targetUserId: number) {
    const privacyCheck = await this.privacyService.canViewProfile(viewerId, targetUserId);
    if (!privacyCheck.allowed) {
      throw new ForbiddenException(privacyCheck.reason);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarCid: true,
        backgroundCid: true,
        backgroundColor: true,
        bio: true,
        createdAt: true,
        allowFollow: true,
        allowMessage: true,
        hideFollowing: true,
        hideFollowers: true,
        _count: {
          select: {
            article: true,
            moment: true,
            userfollows_userfollows_followingIdTouser: true,
            userfollows_userfollows_followerIdTouser: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    if (updateUserDto.username) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          username: updateUserDto.username,
          id: { not: id },
        },
      });

      if (existingUser) {
        throw new ConflictException('用户名已被占用');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarCid: true,
        backgroundCid: true,
        backgroundColor: true,
        globalBackgroundCid: true,
        globalBackgroundColor: true,
        language: true,
        fontSize: true,
        colorScheme: true,
        defaultVisibility: true,
        bio: true,
        allowFollow: true,
        allowMessage: true,
        hideFollowing: true,
        hideFollowers: true,
        updatedAt: true,
      },
    });
  }

  async follow(userId: number, targetUserId: number) {
    const privacyCheck = await this.privacyService.canFollow(userId, targetUserId);
    if (!privacyCheck.allowed) {
      throw new ForbiddenException(privacyCheck.reason);
    }

    const existingFollow = await this.prisma.userfollows.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
    });

    if (existingFollow) {
      throw new ConflictException('已关注该用户');
    }

    await this.prisma.userfollows.create({
      data: {
        followerId: userId,
        followingId: targetUserId,
      },
    });

    this.logger.log(`用户 ${userId} 关注了 ${targetUserId}`);
    return { message: '关注成功' };
  }

  async unfollow(userId: number, targetUserId: number) {
    if (userId === targetUserId) {
      throw new ConflictException('不能取消关注自己');
    }

    const existingFollow = await this.prisma.userfollows.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
    });

    if (!existingFollow) {
      throw new ConflictException('未关注该用户');
    }

    await this.prisma.userfollows.delete({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
    });

    this.logger.log(`用户 ${userId} 取消关注了 ${targetUserId}`);
    return { message: '取消关注成功' };
  }

  async blockUser(userId: number, blockId: number) {
    if (userId === blockId) {
      throw new ConflictException('不能拉黑自己');
    }

    const targetUser = await this.prisma.user.findUnique({ where: { id: blockId } });
    if (!targetUser) {
      throw new NotFoundException('目标用户不存在');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const blockedIds = JSON.parse(user.blockedUserIds || '[]') as number[];

    if (blockedIds.includes(blockId)) {
      throw new ConflictException('已经拉黑该用户');
    }

    blockedIds.push(blockId);

    await this.prisma.userfollows.deleteMany({
      where: {
        OR: [
          { followerId: userId, followingId: blockId },
          { followerId: blockId, followingId: userId },
        ],
      },
    });

    this.logger.log(`用户 ${userId} 拉黑了 ${blockId}`);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        blockedUserIds: JSON.stringify(blockedIds),
      },
      select: {
        id: true,
        nickname: true,
        username: true,
      },
    });
  }

  async unblockUser(userId: number, unblockId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const blockedIds = JSON.parse(user.blockedUserIds || '[]') as number[];

    if (!blockedIds.includes(unblockId)) {
      throw new NotFoundException('未拉黑此用户');
    }

    const updatedBlocked = blockedIds.filter(id => id !== unblockId);

    this.logger.log(`用户 ${userId} 取消拉黑了 ${unblockId}`);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        blockedUserIds: JSON.stringify(updatedBlocked),
      },
      select: {
        id: true,
        nickname: true,
        username: true,
      },
    });
  }

  async getFollowing(viewerId: number | null, targetUserId: number, skip: number = 0, take: number = 20) {
    const privacyCheck = await this.privacyService.canViewFollowing(viewerId, targetUserId);
    if (!privacyCheck.allowed) {
      throw new ForbiddenException(privacyCheck.reason);
    }

    const followingRelations = await this.prisma.userfollows.findMany({
      where: { followerId: targetUserId },
      skip,
      take,
      include: {
        user_userfollows_followingIdTouser: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return followingRelations.map(rel => rel.user_userfollows_followingIdTouser);
  }

  async getFollowers(viewerId: number | null, targetUserId: number, skip: number = 0, take: number = 20) {
    const privacyCheck = await this.privacyService.canViewFollowers(viewerId, targetUserId);
    if (!privacyCheck.allowed) {
      throw new ForbiddenException(privacyCheck.reason);
    }

    const followerRelations = await this.prisma.userfollows.findMany({
      where: { followingId: targetUserId },
      skip,
      take,
      include: {
        user_userfollows_followerIdTouser: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return followerRelations.map(rel => rel.user_userfollows_followerIdTouser);
  }

  async getFollowerCount(userId: number) {
    const count = await this.prisma.userfollows.count({
      where: { followingId: userId },
    });
    return { count };
  }

  async isFollowing(userId: number, targetUserId: number) {
    const follow = await this.prisma.userfollows.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
    });
    return { isFollowing: !!follow };
  }

  async isBlocked(userId: number, targetUserId: number) {
    const isBlocked = await this.privacyService.isBlocked(targetUserId, userId);
    const hasBlocked = await this.privacyService.hasBlocked(userId, targetUserId);
    return { isBlocked, hasBlocked };
  }

  async getBlockedUsers(userId: number, skip: number = 0, take: number = 20) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { blockedUserIds: true },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const blockedIds = JSON.parse(user.blockedUserIds || '[]') as number[];
    
    if (blockedIds.length === 0) {
      return [];
    }

    const paginatedIds = blockedIds.slice(skip, skip + take);

    const blockedUsers = await this.prisma.user.findMany({
      where: {
        id: { in: paginatedIds },
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarCid: true,
        bio: true,
      },
    });

    return blockedUsers;
  }

  async searchUsers(query: string, skip: number = 0, take: number = 20) {
    if (query.startsWith('@')) {
      const username = query.substring(1);
      if (!username) {
        return [];
      }
      return this.prisma.user.findMany({
        where: {
          username,
          isFrozen: false,
        },
        skip,
        take,
        select: {
          id: true,
          username: true,
          nickname: true,
          avatarCid: true,
          bio: true,
          createdAt: true,
        },
      });
    }

    return this.prisma.user.findMany({
      where: {
        OR: [
          { nickname: { contains: query } },
          { username: { contains: query } },
        ],
        isFrozen: false,
      },
      skip,
      take,
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarCid: true,
        bio: true,
        createdAt: true,
      },
    });
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('原密码错误');
    }

    if (newPassword.length < 6) {
      throw new BadRequestException('新密码长度不能少于6位');
    }

    const passwordValidation = await this.adminSecurity.validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      throw new BadRequestException(`密码强度不足: ${passwordValidation.errors.join(', ')}`);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    this.logger.log(`用户 ${userId} 修改了密码`);

    return { message: '密码修改成功' };
  }

  async getUserStats(userId: number) {
    const articlesCount = await this.prisma.article.count({
      where: { authorId: userId },
    });

    const momentsCount = await this.prisma.moment.count({
      where: { authorId: userId },
    });
    
    const followerCount = await this.prisma.userfollows.count({
      where: { followingId: userId },
    });
    
    const followingCount = await this.prisma.userfollows.count({
      where: { followerId: userId },
    });

    const articleLikes = await this.prisma.articlelike.count({
      where: { article: { authorId: userId } },
    });

    const momentLikes = await this.prisma.momentlike.count({
      where: { moment: { authorId: userId } },
    });
    
    const likesCount = articleLikes + momentLikes;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { hideFollowing: true, hideFollowers: true },
    });

    return {
      id: userId,
      followerCount,
      followingCount,
      articleCount: articlesCount,
      momentCount: momentsCount,
      likesCount,
      hideFollowing: user?.hideFollowing || false,
      hideFollowers: user?.hideFollowers || false,
    };
  }

  async getFollowStatus(userId: number, targetUserId: number) {
    const isFollowing = !!(await this.prisma.userfollows.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
    }));

    const isBlocked = await this.privacyService.isBlocked(targetUserId, userId);
    const hasBlocked = await this.privacyService.hasBlocked(userId, targetUserId);

    return {
      isFollowing,
      isBlocked,
      hasBlocked,
    };
  }
}
