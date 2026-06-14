import { Controller, Post, Body, Req, UseGuards, Get, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from '../user/dto/login.dto';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('login')
  login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.authService.login(loginDto, ip, req);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('admin/login')
  adminLogin(@Body() loginDto: LoginDto, @Req() req: Request) {
    return this.authService.adminLogin(loginDto, req);
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('refresh')
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: any, @Body('refreshToken') refreshToken?: string) {
    const userId = req.user.id;
    return this.authService.logout(userId, refreshToken);
  }

  @Get('attempts')
  async getLoginAttempts(@Body('username') username: string) {
    return this.authService.getLoginAttempts(username);
  }

  @Post('admin/bind-device')
  @UseGuards(JwtAuthGuard)
  async bindAdminDevice(@Req() req: any) {
    return this.authService.bindAdminDevice(req.user.id, req);
  }

  @Post('admin/unbind-device')
  @UseGuards(JwtAuthGuard)
  async unbindAdminDevice(
    @Req() req: any,
    @Body('password') password: string
  ) {
    return this.authService.unbindAdminDevice(req.user.id, req, password);
  }

  @Post('admin/enable-mfa')
  @UseGuards(JwtAuthGuard)
  async enableAdminMfa(@Req() req: any) {
    return this.authService.enableAdminMfa(req.user.id, req);
  }

  @Post('admin/confirm-mfa')
  @UseGuards(JwtAuthGuard)
  async confirmAdminMfa(
    @Req() req: any,
    @Body('secret') secret: string,
    @Body('token') token: string
  ) {
    return this.authService.confirmAdminMfa(req.user.id, secret, token, req);
  }

  @Post('admin/disable-mfa')
  @UseGuards(JwtAuthGuard)
  async disableAdminMfa(
    @Req() req: any,
    @Body('password') password: string,
    @Body('mfaToken') mfaToken: string
  ) {
    return this.authService.disableAdminMfa(req.user.id, req, password, mfaToken);
  }

  // ═══ 邮箱验证码登录 ═══

  @Throttle({ default: { ttl: 60000, limit: 1 } })
  @Post('send-login-code')
  @HttpCode(200)
  async sendLoginCode(@Body('email') email: string) {
    return this.authService.sendEmailLoginCode(email);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('login-with-code')
  @HttpCode(200)
  async loginWithCode(
    @Body('email') email: string,
    @Body('code') code: string,
  ) {
    return this.authService.loginWithEmailCode(email, code);
  }

  // ═══ 密码找回 ═══

  @Throttle({ default: { ttl: 60000, limit: 1 } })
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body('email') email: string) {
    return this.authService.sendPasswordResetCode(email);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('verify-reset-code')
  @HttpCode(200)
  async verifyResetCode(
    @Body('email') email: string,
    @Body('code') code: string,
  ) {
    return this.authService.verifyResetCode(email, code);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Body('resetToken') resetToken: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.authService.resetPassword(resetToken, newPassword);
  }

  // ═══ Turnstile 人机验证 ═══

  @Post('verify-turnstile')
  @HttpCode(200)
  async verifyTurnstile(
    @Body('token') token: string,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.authService.verifyTurnstile(token, ip);
  }
}
