import { Controller, Post, Body, Req, UseGuards, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from '../user/dto/login.dto';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.authService.login(loginDto, ip, req);
  }

  @Post('admin/login')
  adminLogin(@Body() loginDto: LoginDto, @Req() req: Request) {
    return this.authService.adminLogin(loginDto, req);
  }

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
}
