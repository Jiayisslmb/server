import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserService } from './user.service';
import { CreateUserDto, LoginDto, UpdateUserDto } from './dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ParseIntPipe } from '@nestjs/common';
import { AdminService } from '../admin/admin.service';
import { RedisService } from 'src/config/redis.service';
import type { Request as ExpressRequest } from 'express';

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly adminService: AdminService,
    private readonly redis: RedisService,
  ) {}

  private async checkRegistrationRateLimit(ip: string): Promise<void> {
    const ipKey = `register:ip:${ip}`;
    const globalKey = 'register:global';

    const ipCount = parseInt(await this.redis.get(ipKey) || '0', 10);
    if (ipCount >= 5) {
      throw new HttpException('同一IP注册过于频繁，请1小时后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    const globalCount = parseInt(await this.redis.get(globalKey) || '0', 10);
    if (globalCount >= 50) {
      throw new HttpException('系统注册人数已达上限，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    await this.redis.set(ipKey, (ipCount + 1).toString(), 3600);
    await this.redis.set(globalKey, (globalCount + 1).toString(), 3600);
  }

  private getClientIp(req: ExpressRequest): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('register')
  async create(@Body() createUserDto: CreateUserDto, @Req() req: ExpressRequest) {
    const ip = this.getClientIp(req);
    await this.checkRegistrationRateLimit(ip);

    if (!createUserDto.captchaKey || !createUserDto.captchaAnswer) {
      throw new BadRequestException('请提供验证码');
    }

    const captchaData = await this.redis.get(`captcha:${createUserDto.captchaKey}`);
    if (!captchaData) {
      throw new BadRequestException('验证码已过期，请重新获取');
    }

    const expectedAnswer = parseInt(captchaData, 10);
    const providedAnswer = parseInt(createUserDto.captchaAnswer, 10);

    await this.redis.del(`captcha:${createUserDto.captchaKey}`);

    if (isNaN(expectedAnswer) || isNaN(providedAnswer) || expectedAnswer !== providedAnswer) {
      throw new BadRequestException('验证码错误');
    }

    return this.userService.create(createUserDto);
  }

  @Get('captcha')
  async generateCaptcha(@Req() req: ExpressRequest) {
    const ip = this.getClientIp(req);
    const ipKey = `captcha:ip:${ip}`;

    const ipCount = parseInt(await this.redis.get(ipKey) || '0', 10);
    if (ipCount >= 10) {
      throw new HttpException('请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.redis.set(ipKey, (ipCount + 1).toString(), 60);

    const crypto = require('crypto');
    const operations = [
      () => {
        const a = Math.floor(Math.random() * 50) + 10;
        const b = Math.floor(Math.random() * 30) + 1;
        return { question: `${a} + ${b} = ?`, answer: a + b };
      },
      () => {
        const a = Math.floor(Math.random() * 40) + 20;
        const b = Math.floor(Math.random() * 20) + 1;
        return { question: `${a} - ${b} = ?`, answer: a - b };
      },
      () => {
        const a = Math.floor(Math.random() * 9) + 2;
        const b = Math.floor(Math.random() * 9) + 2;
        return { question: `${a} × ${b} = ?`, answer: a * b };
      },
    ];

    const op = operations[Math.floor(Math.random() * operations.length)]();
    const key = crypto.randomBytes(16).toString('hex');

    await this.redis.set(`captcha:${key}`, op.answer.toString(), 300);

    return {
      key,
      question: op.question,
    };
  }

  // 登录验证（公开接口，用于生成 JWT）
  @Post('login')
  validateUser(@Body() loginDto: LoginDto) {
    return this.userService.validateUser(loginDto);
  }

  // 获取当前用户信息（需要登录）
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return this.userService.findById(req.user.id);
  }

  // 更新用户资料（需要登录）
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  update(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(req.user.id, updateUserDto);
  }

  // 获取指定用户信息（公开）
  @Get(':id')
  getUserById(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findById(id);
  }

  // 根据用户名获取用户信息（公开）
  @Get('username/:username')
  getUserByUsername(@Param('username') username: string) {
    return this.userService.findByUsername(username);
  }

  // 搜索用户
  @Get()
  searchUsers(
    @Query('keyword') keyword: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.userService.searchUsers(
      keyword,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // ==================== 社交功能 ====================

  // 关注用户（需要登录）
  @Post(':targetUserId/follow')
  @UseGuards(JwtAuthGuard)
  follow(@Request() req, @Param('targetUserId', ParseIntPipe) targetUserId: number) {
    return this.userService.follow(req.user.id, targetUserId);
  }

  // 取消关注（需要登录）
  @Delete(':targetUserId/follow')
  @UseGuards(JwtAuthGuard)
  unfollow(@Request() req, @Param('targetUserId', ParseIntPipe) targetUserId: number) {
    return this.userService.unfollow(req.user.id, targetUserId);
  }

  // 获取关注列表（需要登录）
  @Get(':userId/following')
  @UseGuards(JwtAuthGuard)
  getFollowing(
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.userService.getFollowing(
      req.user.id,
      userId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // 获取粉丝列表（需要登录）
  @Get(':userId/followers')
  @UseGuards(JwtAuthGuard)
  getFollowers(
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.userService.getFollowers(
      req.user.id,
      userId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // 获取粉丝数
  @Get(':userId/follower-count')
  getFollowerCount(@Param('userId', ParseIntPipe) userId: number) {
    return this.userService.getFollowerCount(userId);
  }

  // 检查是否已关注（需要登录）
  @Get(':userId/is-following')
  @UseGuards(JwtAuthGuard)
  isFollowing(
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req,
  ) {
    return this.userService.isFollowing(req.user.id, userId);
  }

  // 拉黑用户（需要登录）
  @Post(':blockId/block')
  @UseGuards(JwtAuthGuard)
  blockUser(
    @Param('blockId', ParseIntPipe) blockId: number,
    @Request() req,
  ) {
    return this.userService.blockUser(req.user.id, blockId);
  }

  // 取消拉黑（需要登录）
  @Delete(':unblockId/block')
  @UseGuards(JwtAuthGuard)
  unblockUser(
    @Param('unblockId', ParseIntPipe) unblockId: number,
    @Request() req,
  ) {
    return this.userService.unblockUser(req.user.id, unblockId);
  }

  // 获取拉黑列表（需要登录）
  @Get('blocked/list')
  @UseGuards(JwtAuthGuard)
  getBlockedUsers(
    @Request() req,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.userService.getBlockedUsers(
      req.user.id,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // 检查是否已拉黑（需要登录）
  @Get(':userId/is-blocked')
  @UseGuards(JwtAuthGuard)
  isBlocked(
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req,
  ) {
    return this.userService.isBlocked(req.user.id, userId);
  }

  // 修改密码（需要登录）
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @Request() req,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    return this.userService.changePassword(
      req.user.id,
      body.oldPassword,
      body.newPassword,
    );
  }

  // 获取用户统计信息（粉丝数、关注数等）
  @Get('stats/:id')
  getUserStats(@Param('id', ParseIntPipe) id: number) {
    return this.userService.getUserStats(id);
  }

  // 举报用户
  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  reportUser(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body('reason') reason: string,
    @Body('description') description?: string,
  ) {
    return this.adminService.createReport(
      'user',
      id,
      reason,
      description,
      req.user.id,
    );
  }
}
