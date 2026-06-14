import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';

export interface GitHubProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  email: string;
}

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GitHubStrategy.name);

  constructor(private configService: ConfigService) {
    const clientID = configService.get<string>('GITHUB_CLIENT_ID');
    const clientSecret = configService.get<string>('GITHUB_CLIENT_SECRET');
    const callbackURL = configService.get<string>('GITHUB_CALLBACK_URL');

    if (!clientID || !clientSecret) {
      throw new Error('GitHub OAuth credentials not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.');
    }

    super({
      clientID,
      clientSecret,
      callbackURL: callbackURL || 'http://localhost:3001/api/auth/github/callback',
      scope: ['user:email'],
      // 中国网络环境下 GitHub SSL 证书可能被中间人干扰，使用自定义 Agent
      customHeaders: { 'User-Agent': 'DeSocial' },
    });

    // 绕过 SSL 证书验证（仅 GitHub OAuth，因国内网络环境特殊）
    const strategy = (this as any)._oauth2;
    if (strategy) {
      strategy._client = strategy._client || {};
      strategy._agent = new https.Agent({ rejectUnauthorized: false });
    }

    this.logger.log('GitHub OAuth strategy initialized');
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      username?: string;
      displayName?: string;
      photos?: Array<{ value: string }>;
      emails?: Array<{ value: string }>;
    },
    done: (err: Error | null, user: GitHubProfile | null) => void,
  ): Promise<void> {
    const githubProfile: GitHubProfile = {
      id: profile.id,
      username: profile.username || profile.displayName || `user_${profile.id}`,
      displayName: profile.displayName || profile.username || '',
      avatarUrl: profile.photos?.[0]?.value || '',
      email: profile.emails?.[0]?.value || '',
    };

    this.logger.log(`GitHub user authenticated: ${githubProfile.username} (${profile.id})`);
    done(null, githubProfile);
  }
}
