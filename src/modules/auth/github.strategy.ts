import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

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

    // state: 'true' 启用 Passport 自动 state 验证（CSRF 防护）
    // @types/passport-github2 类型定义过时，实际 passport 0.6+ 支持 boolean
    super({
      clientID,
      clientSecret,
      callbackURL: callbackURL || 'http://localhost:3001/api/auth/github/callback',
      scope: ['user:email'],
      state: 'true',
    } as any);

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
