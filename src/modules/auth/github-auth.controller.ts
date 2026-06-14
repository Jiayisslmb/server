import { Controller, Get, Post, Req, Res, UseGuards, Logger, Body, HttpCode } from '@nestjs/common';
import { GitHubAuthGuard } from './github-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { GitHubProfile } from './github.strategy';
import { UserService } from '../user/user.service';
import { RedisService } from 'src/config/redis.service';
import { AuthService } from './auth.service';
import * as crypto from 'crypto';

interface GitHubUserInfo {
  id: number;
  username: string;
  isAdmin: boolean;
  isFrozen: boolean;
}

@Controller('auth')
export class GitHubAuthController {
  private readonly logger = new Logger(GitHubAuthController.name);
  private readonly frontendUrl: string;
  private readonly refreshTokenExpiry = 7 * 24 * 60 * 60;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private userService: UserService,
    private redis: RedisService,
    private authService: AuthService,
  ) {
    this.frontendUrl = configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  @Get('github')
  @UseGuards(GitHubAuthGuard)
  async githubAuth() {
    // Guard redirects to GitHub
  }

  @Get('github/callback')
  @UseGuards(GitHubAuthGuard)
  async githubAuthCallback(@Req() req: any, @Res() res: Response) {
    const githubProfile: GitHubProfile = req.user;

    if (!githubProfile) {
      this.logger.error('GitHub callback received without profile');
      res.redirect(`${this.frontendUrl}/auth/sign-in?error=github_auth_failed`);
      return;
    }

    try {
      let user: GitHubUserInfo | null = await this.userService.findByGithubId(githubProfile.id).catch(() => null);

      if (!user) {
        const randomPassword = crypto.randomBytes(32).toString('hex');
        const username = await this.generateUniqueUsername(githubProfile.username);

        user = await this.userService.createFromGitHub({
          githubId: githubProfile.id,
          username,
          password: randomPassword,
          nickname: githubProfile.displayName || githubProfile.username,
          avatarUrl: githubProfile.avatarUrl,
          email: githubProfile.email || undefined,
        });

        this.logger.log(`New user created via GitHub: ${username} (github_id: ${githubProfile.id})`);
      } else {
        this.logger.log(`Existing user logged in via GitHub: ${user.username} (id: ${user.id})`);
      }

      if (!user || user.isFrozen) {
        res.redirect(`${this.frontendUrl}/auth/sign-in?error=account_frozen`);
        return;
      }

      const payload = { id: user.id, username: user.username, isAdmin: user.isAdmin };
      const accessToken = this.jwtService.sign(payload, { expiresIn: '2h' });
      const refreshToken = crypto.randomBytes(64).toString('hex');

      const refreshKey = `refresh:${user.id}:${refreshToken}`;
      await this.redis.set(refreshKey, user.id.toString(), this.refreshTokenExpiry);

      // 设置 httpOnly cookie（生产环境 secure）
      const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
      res.cookie('token', accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax' as const,
        maxAge: this.refreshTokenExpiry * 1000,
        path: '/',
      });

      // 生成临时授权码，避免 Token 暴露在 URL 中
      const authCode = crypto.randomBytes(16).toString('hex');
      const codeKey = `github_oauth:${authCode}`;
      const codeData = JSON.stringify({
        accessToken,
        refreshToken,
        userId: user.id,
        isAdmin: user.isAdmin || false,
      });
      await this.redis.set(codeKey, codeData, 300); // 5 分钟有效期

      res.redirect(
        `${this.frontendUrl}/?github_auth=success&code=${authCode}`,
      );
    } catch (error: any) {
      this.logger.error(`GitHub auth callback error: ${error.message}`);
      res.redirect(`${this.frontendUrl}/auth/sign-in?error=github_auth_failed`);
    }
  }

  /**
   * 用临时授权码交换 Token（避免 Token 暴露在 URL 中）
   */
  @Post('github/exchange')
  @HttpCode(200)
  async exchangeCode(@Body('code') code: string) {
    if (!code) {
      return { success: false, message: '缺少授权码' };
    }

    const codeKey = `github_oauth:${code}`;
    const codeData = await this.redis.get(codeKey);

    if (!codeData) {
      return { success: false, message: '授权码无效或已过期' };
    }

    // 一次性使用，立即删除
    await this.redis.del(codeKey);

    try {
      const data = JSON.parse(codeData);
      return { success: true, ...data };
    } catch {
      return { success: false, message: '授权码解析失败' };
    }
  }

  private async generateUniqueUsername(baseName: string): Promise<string> {
    const sanitized = baseName.replace(/[^a-zA-Z0-9_一-鿿]/g, '').slice(0, 50) || 'github_user';
    let username = sanitized;
    let suffix = 1;

    while (true) {
      const exists = await this.userService.checkUsernameExists(username);
      if (!exists) return username;
      username = `${sanitized.slice(0, 45)}_${suffix}`;
      suffix++;
      if (suffix > 999) {
        return `${sanitized.slice(0, 40)}_${Date.now()}`;
      }
    }
  }
}
