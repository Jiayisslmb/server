import { Controller, Get, Req, Res, UseGuards, Logger } from '@nestjs/common';
import { GitHubAuthGuard } from './github-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { GitHubProfile } from './github.strategy';
import { UserService } from '../user/user.service';
import { RedisService } from 'src/config/redis.service';
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

      res.cookie('token', accessToken, {
        httpOnly: false,
        secure: false,
        sameSite: 'lax' as const,
        maxAge: this.refreshTokenExpiry * 1000,
        path: '/',
      });

      res.redirect(
        `${this.frontendUrl}/?github_auth=success&token=${accessToken}&refreshToken=${refreshToken}&userId=${user.id}&isAdmin=${user.isAdmin || false}`,
      );
    } catch (error: any) {
      this.logger.error(`GitHub auth callback error: ${error.message}`);
      res.redirect(`${this.frontendUrl}/auth/sign-in?error=github_auth_failed`);
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
