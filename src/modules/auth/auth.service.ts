import { Injectable, UnauthorizedException, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { LoginDto } from '../user/dto/login.dto';
import { RedisService } from 'src/config/redis.service';
import { AdminSecurityService } from 'src/common/services/admin-security.service';
import { EmailService } from 'src/common/services/email.service';
import { Request } from 'express';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly maxLoginAttempts = 5;
  private readonly lockoutDuration = 15 * 60 * 1000;
  private readonly refreshTokenExpiry = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redis: RedisService,
    private adminSecurity: AdminSecurityService,
    private emailService: EmailService,
  ) {}

  async login(loginDto: LoginDto, ip: string, req?: Request) {
    const { username } = loginDto;
    const lockKey = `lock:${username}`;
    const attemptsKey = `attempts:${username}`;
    const ipLockKey = `lock:ip:${ip}`;
    const ipAttemptsKey = `attempts:ip:${ip}`;

    const isLocked = await this.redis.get(lockKey);
    if (isLocked) {
      const ttl = await this.redis.getClient().ttl(lockKey);
      throw new UnauthorizedException(
        `账户已被锁定，请在 ${Math.ceil(ttl / 60)} 分钟后重试`,
      );
    }

    const isIpLocked = await this.redis.get(ipLockKey);
    if (isIpLocked) {
      const ttl = await this.redis.getClient().ttl(ipLockKey);
      throw new UnauthorizedException(
        `IP已被锁定，请在 ${Math.ceil(ttl / 60)} 分钟后重试`,
      );
    }

    try {
      const user = await this.userService.validateUser(loginDto);

      await this.redis.del(attemptsKey);
      await this.redis.del(ipAttemptsKey);

      let sessionToken: string | undefined;
      let adminSession: string | undefined;

      if (user.isAdmin && req) {
        const fingerprint = this.adminSecurity.generateDeviceFingerprint(req);

        if (!await this.adminSecurity.validateDeviceBinding(user.id, fingerprint)) {
          await this.adminSecurity.recordFailedLogin(user.id);
          if (req) {
            await this.adminSecurity.logAdminAction(
              user.id,
              'ADMIN_LOGIN_DEVICE_MISMATCH',
              req,
              'user',
              user.id,
              JSON.stringify({ fingerprint, ip })
            );
          }
          throw new UnauthorizedException('设备验证失败，请使用已绑定的设备登录');
        }

        if (user.mfaEnabled) {
          if (!loginDto.mfaToken) {
            return {
              requireMfa: true,
              message: '请输入双因素认证验证码',
            };
          }

          if (!user.mfaSecret || !this.adminSecurity.verifyMfaToken(user.mfaSecret, loginDto.mfaToken)) {
            await this.adminSecurity.recordFailedLogin(user.id);
            throw new UnauthorizedException('双因素认证验证码错误');
          }
        }

        await this.adminSecurity.resetFailedLoginAttempts(user.id);

        sessionToken = await this.adminSecurity.createSession(
          user.id,
          fingerprint,
          req
        );
        adminSession = sessionToken;

        await this.adminSecurity.logAdminAction(
          user.id,
          'ADMIN_LOGIN_SUCCESS',
          req,
          'user',
          user.id,
          JSON.stringify({ fingerprint, ip })
        );
      }

      const payload = {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        ...(adminSession ? { adminSession } : {}),
      };

      const accessToken = this.jwtService.sign(payload, {
        expiresIn: '2h',
      });

      const refreshToken = this.generateRefreshToken(user.id);

      await this.storeRefreshToken(user.id, refreshToken);

      this.logger.log(`用户登录成功: ${username} (IP: ${ip}${user.isAdmin ? ', 管理员' : ''})`);

      return {
        accessToken,
        refreshToken,
        ...(sessionToken ? { sessionToken } : {}),
        expiresIn: 2 * 60 * 60,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatarCid: user.avatarCid,
          backgroundCid: user.backgroundCid,
          backgroundColor: user.backgroundColor,
          globalBackgroundCid: user.globalBackgroundCid,
          globalBackgroundColor: user.globalBackgroundColor,
          bio: user.bio,
          email: user.email,
          emailVerified: user.emailVerified,
          isAdmin: user.isAdmin,
          language: user.language,
          fontSize: user.fontSize,
          colorScheme: user.colorScheme,
          defaultVisibility: user.defaultVisibility,
          ...(user.mfaEnabled !== undefined ? { mfaEnabled: user.mfaEnabled } : {}),
        },
      };
    } catch (error) {
      const userRecord = await this.userService.findByUsername(username).catch(() => null);
      if (userRecord?.isAdmin) {
        await this.adminSecurity.recordFailedLogin(userRecord.id);
      }

      const userAttemptsStr = await this.redis.get(attemptsKey);
      const userAttempts = parseInt(userAttemptsStr || '0', 10);
      const newUserAttempts = userAttempts + 1;
      await this.redis.set(attemptsKey, newUserAttempts.toString(), 3600);

      const ipAttemptsStr = await this.redis.get(ipAttemptsKey);
      const ipAttempts = parseInt(ipAttemptsStr || '0', 10);
      const newIpAttempts = ipAttempts + 1;
      await this.redis.set(ipAttemptsKey, newIpAttempts.toString(), 3600);

      if (newUserAttempts >= this.maxLoginAttempts) {
        await this.redis.set(lockKey, '1', Math.ceil(this.lockoutDuration / 1000));
        this.logger.warn(`账户锁定: ${username} (失败次数: ${newUserAttempts})`);
        throw new UnauthorizedException(
          `登录失败次数过多，账户已被锁定 ${this.lockoutDuration / 60000} 分钟`,
        );
      }

      if (newIpAttempts >= this.maxLoginAttempts * 2) {
        await this.redis.set(ipLockKey, '1', Math.ceil(this.lockoutDuration / 1000));
        this.logger.warn(`IP锁定: ${ip} (失败次数: ${newIpAttempts})`);
        throw new UnauthorizedException(
          `登录失败次数过多，IP已被锁定 ${this.lockoutDuration / 60000} 分钟`,
        );
      }

      const remainingAttempts = this.maxLoginAttempts - newUserAttempts;
      this.logger.warn(
        `登录失败: ${username} (剩余尝试次数: ${remainingAttempts}, IP: ${ip})`,
      );

      throw error;
    }
  }

  async refreshToken(refreshToken: string) {
    const userId = await this.validateRefreshToken(refreshToken);
    if (!userId) {
      throw new UnauthorizedException('无效的刷新令牌');
    }

    const user = await this.userService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    await this.revokeRefreshToken(refreshToken);

    const payload = {
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
    };

    const newAccessToken = this.jwtService.sign(payload, {
      expiresIn: '2h',
    });

    const newRefreshToken = this.generateRefreshToken(user.id);
    await this.storeRefreshToken(user.id, newRefreshToken);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 2 * 60 * 60,
    };
  }

  async logout(userId: number, refreshToken?: string) {
    if (refreshToken) {
      await this.revokeRefreshToken(refreshToken);
    }

    const pattern = `refresh:${userId}:*`;
    const keys = await this.redis.getKeys(pattern);
    if (keys.length > 0) {
      await this.redis.delMany(keys);
    }

    this.logger.log(`用户登出: ${userId}`);
    return { success: true };
  }

  private generateRefreshToken(userId: number): string {
    const crypto = require('crypto');
    return crypto.randomBytes(64).toString('hex');
  }

  private async storeRefreshToken(userId: number, token: string): Promise<void> {
    const key = `refresh:${userId}:${token}`;
    await this.redis.set(key, userId.toString(), Math.ceil(this.refreshTokenExpiry / 1000));
  }

  private async validateRefreshToken(token: string): Promise<number | null> {
    const pattern = `refresh:*:${token}`;
    const keys = await this.redis.getKeys(pattern);
    
    if (keys.length === 0) {
      return null;
    }

    const userId = await this.redis.get(keys[0]);
    return userId ? parseInt(userId, 10) : null;
  }

  private async revokeRefreshToken(token: string): Promise<void> {
    const pattern = `refresh:*:${token}`;
    const keys = await this.redis.getKeys(pattern);
    
    if (keys.length > 0) {
      await this.redis.delMany(keys);
    }
  }

  async getLoginAttempts(username: string): Promise<{ attempts: number; isLocked: boolean }> {
    const attemptsStr = await this.redis.get(`attempts:${username}`);
    const attempts = parseInt(attemptsStr || '0', 10);
    const isLocked = !!(await this.redis.get(`lock:${username}`));
    return { attempts, isLocked };
  }

  async adminLogin(loginDto: LoginDto, req: Request) {
    const { username } = loginDto;
    const ip = this.getClientIp(req);
    const fingerprint = this.adminSecurity.generateDeviceFingerprint(req);

    const user = await this.userService.findByUsername(username);
    if (!user || !user.isAdmin) {
      throw new UnauthorizedException('管理员账户不存在');
    }

    if (await this.adminSecurity.checkAccountLockout(user.id)) {
      throw new UnauthorizedException('账户已被临时锁定，请稍后重试');
    }

    try {
      const validatedUser = await this.userService.validateUser(loginDto);

      if (!await this.adminSecurity.validateDeviceBinding(validatedUser.id, fingerprint)) {
        await this.adminSecurity.recordFailedLogin(validatedUser.id);
        await this.adminSecurity.logAdminAction(
          validatedUser.id,
          'ADMIN_LOGIN_DEVICE_MISMATCH',
          req,
          'user',
          validatedUser.id,
          JSON.stringify({ fingerprint, ip })
        );
        throw new UnauthorizedException('设备验证失败，请使用已绑定的设备登录');
      }

      if (validatedUser.mfaEnabled) {
        if (!loginDto.mfaToken) {
          return {
            requireMfa: true,
            message: '请输入双因素认证验证码'
          };
        }

        if (!validatedUser.mfaSecret || !this.adminSecurity.verifyMfaToken(validatedUser.mfaSecret, loginDto.mfaToken)) {
          await this.adminSecurity.recordFailedLogin(validatedUser.id);
          throw new UnauthorizedException('双因素认证验证码错误');
        }
      }

      await this.adminSecurity.resetFailedLoginAttempts(validatedUser.id);

      const sessionToken = await this.adminSecurity.createSession(
        validatedUser.id,
        fingerprint,
        req
      );

      const payload = {
        id: validatedUser.id,
        username: validatedUser.username,
        isAdmin: validatedUser.isAdmin,
        adminSession: sessionToken,
      };

      const accessToken = this.jwtService.sign(payload, {
        expiresIn: '2h',
      });

      const refreshToken = this.generateRefreshToken(validatedUser.id);
      await this.storeRefreshToken(validatedUser.id, refreshToken);

      await this.adminSecurity.logAdminAction(
        validatedUser.id,
        'ADMIN_LOGIN_SUCCESS',
        req,
        'user',
        validatedUser.id,
        JSON.stringify({ fingerprint, ip })
      );

      this.logger.log(`管理员登录成功: ${username} (IP: ${ip})`);

      return {
        accessToken,
        refreshToken,
        sessionToken,
        expiresIn: 2 * 60 * 60,
        user: {
          id: validatedUser.id,
          username: validatedUser.username,
          avatarCid: validatedUser.avatarCid,
          isAdmin: validatedUser.isAdmin,
          mfaEnabled: validatedUser.mfaEnabled,
          adminDeviceBound: validatedUser.adminDeviceBound,
        },
      };
    } catch (error) {
      if (user) {
        await this.adminSecurity.recordFailedLogin(user.id);
      }
      throw error;
    }
  }

  async bindAdminDevice(userId: number, req: Request) {
    const fingerprint = this.adminSecurity.generateDeviceFingerprint(req);
    
    const user = await this.userService.findById(userId);
    if (!user || !user.isAdmin) {
      throw new UnauthorizedException('只有管理员可以绑定设备');
    }

    await this.adminSecurity.bindDevice(userId, fingerprint);
    await this.adminSecurity.logAdminAction(
      userId,
      'ADMIN_DEVICE_BOUND',
      req,
      'user',
      userId,
      JSON.stringify({ fingerprint })
    );

    return { success: true, message: '设备绑定成功' };
  }

  async unbindAdminDevice(userId: number, req: Request, password: string) {
    const user = await this.userService.findById(userId);
    if (!user || !user.isAdmin) {
      throw new UnauthorizedException('只有管理员可以解绑设备');
    }

    if (!await this.adminSecurity.requireReAuth(userId, password)) {
      throw new UnauthorizedException('密码验证失败');
    }

    await this.adminSecurity.unbindDevice(userId);
    await this.adminSecurity.logAdminAction(
      userId,
      'ADMIN_DEVICE_UNBOUND',
      req,
      'user',
      userId,
      undefined
    );

    return { success: true, message: '设备解绑成功' };
  }

  async enableAdminMfa(userId: number, req: Request) {
    const user = await this.userService.findById(userId);
    if (!user || !user.isAdmin) {
      throw new UnauthorizedException('只有管理员可以启用MFA');
    }

    const { secret, otpauthUrl } = this.adminSecurity.generateMfaSecret();
    
    return {
      secret,
      otpauthUrl,
      message: '请使用Google Authenticator扫描二维码'
    };
  }

  async confirmAdminMfa(userId: number, secret: string, token: string, req: Request) {
    const user = await this.userService.findById(userId);
    if (!user || !user.isAdmin) {
      throw new UnauthorizedException('只有管理员可以启用MFA');
    }

    if (!this.adminSecurity.verifyMfaToken(secret, token)) {
      throw new BadRequestException('验证码错误');
    }

    await this.adminSecurity.enableMfa(userId, secret);
    await this.adminSecurity.logAdminAction(
      userId,
      'ADMIN_MFA_ENABLED',
      req,
      'user',
      userId,
      undefined
    );

    return { success: true, message: 'MFA启用成功' };
  }

  async disableAdminMfa(userId: number, req: Request, password: string, mfaToken: string) {
    const user = await this.userService.findById(userId);
    if (!user || !user.isAdmin) {
      throw new UnauthorizedException('只有管理员可以禁用MFA');
    }

    if (!await this.adminSecurity.requireReAuth(userId, password)) {
      throw new UnauthorizedException('密码验证失败');
    }

    if (!user.mfaSecret || !this.adminSecurity.verifyMfaToken(user.mfaSecret, mfaToken)) {
      throw new BadRequestException('MFA验证码错误');
    }

    await this.adminSecurity.disableMfa(userId);
    await this.adminSecurity.logAdminAction(
      userId,
      'ADMIN_MFA_DISABLED',
      req,
      'user',
      userId,
      undefined
    );

    return { success: true, message: 'MFA禁用成功' };
  }

  // ═══════════════════════════════════════════════════════════════
  // 邮箱验证码登录
  // ═══════════════════════════════════════════════════════════════

  async sendEmailLoginCode(email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new NotFoundException('该邮箱未注册');

    const code = this.generateVerificationCode();
    const key = `email:login:${email}`;
    await this.redis.set(key, code, 300); // 5分钟过期

    const sent = await this.emailService.sendVerificationCode(email, code);
    if (!sent) throw new BadRequestException('邮件发送失败，请稍后重试');

    this.logger.log(`邮箱登录验证码已发送: ${email}`);
    return { success: true, message: '验证码已发送' };
  }

  async loginWithEmailCode(email: string, code: string) {
    const key = `email:login:${email}`;
    const storedCode = await this.redis.get(key);

    if (!storedCode || storedCode !== code) {
      throw new UnauthorizedException('验证码错误或已过期');
    }

    await this.redis.del(key);

    const user = await this.userService.findByEmail(email);
    if (!user) throw new NotFoundException('用户不存在');

    const payload = { id: user.id, username: user.username, isAdmin: user.isAdmin };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '2h' });
    const refreshToken = this.generateRefreshToken(user.id);
    await this.storeRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      expiresIn: 2 * 60 * 60,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatarCid: user.avatarCid,
        email: user.email,
        emailVerified: user.emailVerified,
        isAdmin: user.isAdmin,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 密码找回
  // ═══════════════════════════════════════════════════════════════

  async sendPasswordResetCode(email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new NotFoundException('该邮箱未注册');

    const code = this.generateVerificationCode();
    const key = `pwd:reset:${email}`;
    await this.redis.set(key, code, 300); // 5分钟过期

    const sent = await this.emailService.sendPasswordResetCode(email, code);
    if (!sent) throw new BadRequestException('邮件发送失败，请稍后重试');

    this.logger.log(`密码重置验证码已发送: ${email}`);
    return { success: true, message: '验证码已发送' };
  }

  async verifyResetCode(email: string, code: string) {
    const key = `pwd:reset:${email}`;
    const storedCode = await this.redis.get(key);

    if (!storedCode || storedCode !== code) {
      throw new UnauthorizedException('验证码错误或已过期');
    }

    // 验证通过后生成临时 token 用于重置密码
    const resetToken = this.generateRefreshToken(email as unknown as number);
    const tokenKey = `pwd:token:${resetToken}`;
    await this.redis.set(tokenKey, email, 300);

    return { resetToken };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    const tokenKey = `pwd:token:${resetToken}`;
    const email = await this.redis.get(tokenKey);

    if (!email) {
      throw new UnauthorizedException('重置令牌已过期，请重新发起');
    }

    const user = await this.userService.findByEmail(email);
    if (!user) throw new NotFoundException('用户不存在');

    // 密码强度验证
    if (newPassword.length < 6) {
      throw new BadRequestException('新密码长度不能少于6位');
    }
    const passwordValidation = await this.adminSecurity.validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      throw new BadRequestException(`密码强度不足: ${passwordValidation.errors.join(', ')}`);
    }

    await this.userService.updatePassword(user.id, newPassword);
    await this.redis.del(tokenKey);
    await this.redis.del(`pwd:reset:${email}`);

    this.logger.log(`密码已重置: ${email}`);
    return { success: true, message: '密码重置成功' };
  }

  // ═══════════════════════════════════════════════════════════════
  // Cloudflare Turnstile 验证
  // ═══════════════════════════════════════════════════════════════

  async verifyTurnstile(token: string, ip?: string) {
    const secretKey = this.configService.get('TURNSTILE_SECRET_KEY');
    if (!secretKey) {
      // Turnstile 未配置时降级通过
      this.logger.warn('Turnstile 未配置，跳过验证');
      return { success: true };
    }

    try {
      const formData = new URLSearchParams();
      formData.append('secret', secretKey);
      formData.append('response', token);
      if (ip) formData.append('remoteip', ip);

      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        this.logger.warn(`Turnstile 验证失败: ${JSON.stringify(data)}`);
        throw new UnauthorizedException('人机验证失败，请重试');
      }

      return { success: true };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      // 网络异常时降级通过
      this.logger.warn(`Turnstile 验证服务异常，降级通过: ${error.message}`);
      return { success: true };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 工具方法
  // ═══════════════════════════════════════════════════════════════

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }
}
