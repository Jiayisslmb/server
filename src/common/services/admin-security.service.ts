import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { Request } from 'express';

@Injectable()
export class AdminSecurityService {
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 30 * 60 * 1000;
  private readonly SESSION_DURATION = 24 * 60 * 60 * 1000;
  private readonly MIN_PASSWORD_LENGTH = 8;

  constructor(private prisma: PrismaService) {}

  generateDeviceFingerprint(req: Request): string {
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const secChUa = req.headers['sec-ch-ua'] || '';
    const secChPlatform = req.headers['sec-ch-ua-platform'] || '';
    
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${userAgent}|${acceptLanguage}|${acceptEncoding}|${secChUa}|${secChPlatform}`)
      .digest('hex');
    
    return fingerprint;
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }

  async validatePasswordStrength(password: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (password.length < this.MIN_PASSWORD_LENGTH) {
      errors.push(`密码长度至少${this.MIN_PASSWORD_LENGTH}位`);
    }
    
    if (!/[a-zA-Z]/.test(password)) {
      errors.push('密码必须包含至少一个字母');
    }
    
    if (!/[0-9]/.test(password)) {
      errors.push('密码必须包含至少一个数字');
    }

    const commonPasswords = [
      'password', '123456', 'admin', 'qwerty', 'abc123',
      'password1', 'admin123', '111111', '000000'
    ];
    
    if (commonPasswords.some(common => password.toLowerCase() === common.toLowerCase())) {
      errors.push('密码过于简单，请使用更复杂的密码');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async checkAccountLockout(userId: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lockedUntil: true, failedLoginAttempts: true }
    });
    
    if (!user) return false;
    
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      return true;
    }
    
    if (user.lockedUntil && new Date() >= user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null
        }
      });
    }
    
    return false;
  }

  async recordFailedLogin(userId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginAttempts: true }
    });
    
    if (!user) return;
    
    const attempts = (user.failedLoginAttempts || 0) + 1;
    
    if (attempts >= this.MAX_LOGIN_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: new Date(Date.now() + this.LOCKOUT_DURATION)
        }
      });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: attempts }
      });
    }
  }

  async resetFailedLoginAttempts(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });
  }

  async validateDeviceBinding(userId: number, fingerprint: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        adminDeviceBound: true,
        adminDeviceFingerprint: true
      }
    });
    
    if (!user) return false;
    
    if (!user.adminDeviceBound) {
      return true;
    }
    
    return user.adminDeviceFingerprint === fingerprint;
  }

  async bindDevice(userId: number, fingerprint: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        adminDeviceFingerprint: fingerprint,
        adminDeviceBound: true
      }
    });
  }

  async unbindDevice(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        adminDeviceFingerprint: null,
        adminDeviceBound: false
      }
    });
    
    await this.prisma.adminsession.deleteMany({
      where: { userId }
    });
  }

  async createSession(
    userId: number,
    fingerprint: string,
    req: Request
  ): Promise<string> {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.SESSION_DURATION);
    
    await this.prisma.adminsession.create({
      data: {
        userId,
        sessionToken,
        deviceFingerprint: fingerprint,
        ipAddress: this.getClientIp(req),
        userAgent: req.headers['user-agent'] || null,
        expiresAt
      }
    });
    
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        adminSessionToken: sessionToken,
        lastAdminLogin: new Date()
      }
    });
    
    return sessionToken;
  }

  async validateSession(sessionToken: string, fingerprint: string): Promise<boolean> {
    const session = await this.prisma.adminsession.findUnique({
      where: { sessionToken },
      include: {
        user: {
          select: {
            id: true,
            isAdmin: true,
            isFrozen: true
          }
        }
      }
    });
    
    if (!session) return false;
    
    if (new Date() > session.expiresAt) {
      await this.invalidateSession(sessionToken);
      return false;
    }
    
    if (session.deviceFingerprint !== fingerprint) {
      await this.invalidateSession(sessionToken);
      return false;
    }
    
    if (!session.user.isAdmin || session.user.isFrozen) {
      await this.invalidateSession(sessionToken);
      return false;
    }
    
    return true;
  }

  async invalidateSession(sessionToken: string): Promise<void> {
    await this.prisma.adminsession.delete({
      where: { sessionToken }
    }).catch(() => {});
    
    await this.prisma.user.updateMany({
      where: { adminSessionToken: sessionToken },
      data: { adminSessionToken: null }
    });
  }

  async invalidateAllSessions(userId: number): Promise<void> {
    await this.prisma.adminsession.deleteMany({
      where: { userId }
    });
    
    await this.prisma.user.update({
      where: { id: userId },
      data: { adminSessionToken: null }
    });
  }

  generateMfaSecret(): { secret: string; otpauthUrl: string } {
    const secret = speakeasy.generateSecret({
      name: 'SocialPlatform Admin',
      length: 32
    });
    
    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url || ''
    };
  }

  async enableMfa(userId: number, secret: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: secret,
        mfaEnabled: true
      }
    });
  }

  async disableMfa(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: null,
        mfaEnabled: false
      }
    });
  }

  verifyMfaToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2
    });
  }

  async logAdminAction(
    userId: number,
    action: string,
    req: Request,
    targetType?: string,
    targetId?: number,
    details?: string
  ): Promise<void> {
    await this.prisma.adminauditlog.create({
      data: {
        userId,
        action,
        targetType,
        targetId,
        details,
        ipAddress: this.getClientIp(req),
        userAgent: req.headers['user-agent'] || null
      }
    });
  }

  async getAuditLogs(
    userId?: number,
    action?: string,
    limit: number = 100,
    offset: number = 0
  ) {
    const where: any = {};
    
    if (userId) where.userId = userId;
    if (action) where.action = action;
    
    const logs = await this.prisma.adminauditlog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });
    
    const total = await this.prisma.adminauditlog.count({ where });
    
    return { logs, total };
  }

  async generateVerificationCode(): Promise<string> {
    return crypto.randomInt(100000, 999999).toString();
  }

  async requireReAuth(userId: number, password: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true }
    });
    
    if (!user) return false;
    
    return bcrypt.compare(password, user.password);
  }
}
