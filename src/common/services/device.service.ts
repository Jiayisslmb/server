import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/config/prisma.service';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const UAParser = require('ua-parser-js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const geoip = require('geoip-lite');

export interface DeviceInfo {
  deviceHash: string;
  deviceName: string;
  os: string;
  browser: string;
  ipAddress: string;
  location: string | null;
  userAgent: string;
}

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 从客户端上报的原始信息解析真实设备标识
   */
  parseDevice(raw: {
    userAgent?: string;
    platform?: string;
    language?: string;
    screenWidth?: number;
    screenHeight?: number;
    timezone?: string;
    ip?: string;
    xForwardedFor?: string;
  }): DeviceInfo {
    const ua = raw.userAgent || 'Unknown';
    const parser = UAParser(ua);
    const uaResult = parser;

    const osName = uaResult.os.name || 'Unknown';
    const osVersion = uaResult.os.version || '';
    const os = osVersion ? `${osName} ${osVersion}` : osName;

    const browserName = uaResult.browser.name || 'Unknown';
    const browserVersion = uaResult.browser.version || '';
    const browser = browserVersion ? `${browserName} ${browserVersion.split('.')[0]}` : browserName;

    const deviceName = `${os} · ${browser}`;

    // 生成设备指纹 hash = SHA256(userAgent + platform + screenWidth + timezone)
    const fingerprint = crypto
      .createHash('sha256')
      .update(ua)
      .update(raw.platform || '')
      .update(String(raw.screenWidth || 0))
      .update(String(raw.screenHeight || 0))
      .update(raw.timezone || '')
      .digest('hex');

    // IP 地址：优先取 x-forwarded-for 最左侧（真实客户端 IP）
    const ipAddress = this.extractClientIp(raw.ip, raw.xForwardedFor);
    const location = this.lookupLocation(ipAddress);

    return {
      deviceHash: fingerprint,
      deviceName,
      os,
      browser,
      ipAddress,
      location,
      userAgent: ua,
    };
  }

  /**
   * 获取或创建设备记录（同一设备不重复创建）
   */
  async getOrCreateDevice(userId: number, deviceInfo: DeviceInfo) {
    const existing = await this.prisma.userDevice.findUnique({
      where: {
        userId_deviceHash: {
          userId,
          deviceHash: deviceInfo.deviceHash,
        },
      },
    });

    if (existing) {
      // 更新最后在线时间 + IP + 激活状态
      return this.prisma.userDevice.update({
        where: { id: existing.id },
        data: {
          ipAddress: deviceInfo.ipAddress,
          location: deviceInfo.location,
          isActive: true,
          lastSeenAt: new Date(),
        },
      });
    }

    // 新设备
    const device = await this.prisma.userDevice.create({
      data: {
        userId,
        deviceHash: deviceInfo.deviceHash,
        deviceName: deviceInfo.deviceName,
        os: deviceInfo.os,
        browser: deviceInfo.browser,
        ipAddress: deviceInfo.ipAddress,
        location: deviceInfo.location,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    this.logger.log(
      `新设备登录: 用户${userId} | ${deviceInfo.deviceName} | IP: ${deviceInfo.ipAddress} | ${deviceInfo.location || '未知位置'}`,
    );

    return device;
  }

  /**
   * 记录登录历史
   */
  async recordLogin(
    userId: number,
    deviceId: number | null,
    deviceInfo: DeviceInfo,
    success: boolean = true,
  ) {
    return this.prisma.loginHistory.create({
      data: {
        userId,
        deviceId,
        ipAddress: deviceInfo.ipAddress,
        location: deviceInfo.location,
        userAgent: deviceInfo.userAgent,
        success,
      },
    });
  }

  /**
   * 标记设备离线（而非删除）
   */
  async markDeviceOffline(userId: number, deviceHash: string) {
    try {
      await this.prisma.userDevice.updateMany({
        where: { userId, deviceHash, isActive: true },
        data: { isActive: false },
      });
    } catch (err) {
      this.logger.warn(`标记设备离线失败: ${err.message}`);
    }
  }

  /**
   * 获取用户的所有设备列表
   */
  async getUserDevices(userId: number) {
    return this.prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /**
   * 获取用户登录历史
   */
  async getLoginHistory(userId: number, limit: number = 20) {
    return this.prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * 踢出指定设备（管理员或用户自己操作）
   */
  async revokeDevice(deviceId: number, userId: number) {
    const device = await this.prisma.userDevice.findFirst({
      where: { id: deviceId, userId },
    });
    if (!device) {
      throw new Error('设备不存在');
    }
    return this.prisma.userDevice.update({
      where: { id: deviceId },
      data: { isActive: false },
    });
  }

  // ==================== 私有方法 ====================

  private extractClientIp(directIp?: string, xForwardedFor?: string): string {
    if (xForwardedFor) {
      const ips = xForwardedFor.split(',').map(s => s.trim());
      const clientIp = ips[0];
      if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') {
        return clientIp;
      }
    }
    if (directIp) {
      // 处理 IPv6 前缀
      return directIp.replace(/^::ffff:/, '');
    }
    return '0.0.0.0';
  }

  private lookupLocation(ip: string): string | null {
    if (ip === '0.0.0.0' || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      return '本地网络';
    }
    try {
      const geo = geoip.lookup(ip);
      if (geo) {
        const parts = [geo.city, geo.region, geo.country].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : null;
      }
    } catch (err) {
      this.logger.warn(`GeoIP 查询失败: ${ip}`);
    }
    return null;
  }
}
