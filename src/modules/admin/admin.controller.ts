// 管理员控制器

import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { AdminGuard } from 'src/common/guards/admin.guard';
import { ParseIntPipe } from '@nestjs/common';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== 用户管理 ====================

  @Post('admins')
  createAdmin(
    @Body('username') username: string,
    @Body('password') password: string,
  ) {
    if (!username || !password) {
      throw new BadRequestException('用户名和密码不能为空');
    }
    if (password.length < 8) {
      throw new BadRequestException('管理员密码长度不能少于8位');
    }
    return this.adminService.createAdmin({ username, password });
  }

  @Post('users/:id/promote')
  promoteToAdmin(@Param('id', ParseIntPipe) userId: number) {
    return this.adminService.promoteToAdmin(userId);
  }

  @Post('users/:id/demote')
  demoteAdmin(@Param('id', ParseIntPipe) userId: number) {
    return this.adminService.demoteAdmin(userId);
  }

  // 获取所有用户
  @Get('users')
  getAllUsers(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.adminService.getAllUsers(
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // 冻结用户
  @Post('users/:id/freeze')
  freezeUser(@Param('id', ParseIntPipe) userId: number) {
    return this.adminService.freezeUser(userId);
  }

  // 解冻用户
  @Post('users/:id/unfreeze')
  unfreezeUser(@Param('id', ParseIntPipe) userId: number) {
    return this.adminService.unfreezeUser(userId);
  }

  // 重置用户密码
  @Post('users/:id/reset-password')
  resetUserPassword(@Param('id', ParseIntPipe) userId: number) {
    return this.adminService.resetUserPassword(userId);
  }

  // ==================== 内容管理 ====================

  // 获取所有动态
  @Get('posts')
  getAllPosts(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.adminService.getAllPosts(
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // 删除动态
  @Delete('posts/:id')
  deletePost(@Param('id', ParseIntPipe) postId: number) {
    return this.adminService.deletePost(postId);
  }

  // 获取所有文章
  @Get('articles')
  getAllArticles(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.adminService.getAllArticles(
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // 删除文章
  @Delete('articles/:id')
  deleteArticle(@Param('id', ParseIntPipe) articleId: number) {
    return this.adminService.deleteArticle(articleId);
  }

  // ==================== 数据统计 ====================

  // 获取平台统计
  @Get('statistics')
  getStatistics() {
    return this.adminService.getStatistics();
  }

  // 获取发布统计
  @Get('statistics/posting')
  getPostingStats(@Query('days') days?: string) {
    return this.adminService.getPostingStats(parseInt(days || '7'));
  }

  // 获取互动统计
  @Get('statistics/interaction')
  getInteractionStats() {
    return this.adminService.getInteractionStats();
  }

  // ==================== 反馈与投诉处理 ====================

  // 获取所有举报
  @Get('reports')
  getReports(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.adminService.getReports(
      parseInt(skip || '0'),
      parseInt(take || '20'),
      status,
      type,
    );
  }

  // 更新举报状态
  @Patch('reports/:id/status')
  updateReportStatus(
    @Param('id', ParseIntPipe) reportId: number,
    @Body('status') status: string,
  ) {
    return this.adminService.updateReportStatus(reportId, status);
  }
}
