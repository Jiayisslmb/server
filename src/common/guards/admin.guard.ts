import { CanActivate, ExecutionContext, Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminSecurityService } from '../services/admin-security.service';
import { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private adminSecurity: AdminSecurityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    if (!user || !user.isAdmin) {
      throw new ForbiddenException('仅管理员可访问此资源');
    }

    if (!user.adminSession) {
      throw new UnauthorizedException('请通过管理员入口登录');
    }

    const fingerprint = this.adminSecurity.generateDeviceFingerprint(request);
    const isValidSession = await this.adminSecurity.validateSession(
      user.adminSession,
      fingerprint,
    );

    if (!isValidSession) {
      throw new UnauthorizedException('管理员会话已失效，请重新登录');
    }

    return true;
  }
}
