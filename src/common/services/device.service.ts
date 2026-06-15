import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/config/prisma.service';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const UAParser = require('ua-parser-js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const geoip = require('geoip-lite');

export interface DeviceInfo {
  deviceHash: string;
  deviceUUID: string;
  deviceName: string;
  deviceType: string;
  os: string;
  browser: string;
  deviceModel: string;
  ipAddress: string;
  location: string | null;
  userAgent: string;
}

/**
 * Android 设备型号 → 商业名称映射表
 * 格式: 型号代码片段 → 商业名称
 */
const ANDROID_MODEL_MAP: Record<string, string> = {
  // Samsung Galaxy S 系列
  'SM-S938': 'Galaxy S25 Ultra', 'SM-S936': 'Galaxy S25+', 'SM-S931': 'Galaxy S25',
  'SM-S928': 'Galaxy S24 Ultra', 'SM-S926': 'Galaxy S24+', 'SM-S921': 'Galaxy S24',
  'SM-S918': 'Galaxy S23 Ultra', 'SM-S916': 'Galaxy S23+', 'SM-S911': 'Galaxy S23',
  'SM-S908': 'Galaxy S22 Ultra', 'SM-S906': 'Galaxy S22+', 'SM-S901': 'Galaxy S22',
  'SM-S9280': 'Galaxy S24 Ultra', 'SM-S9260': 'Galaxy S24+', 'SM-S9210': 'Galaxy S24',
  // Samsung Galaxy Z Fold/Flip
  'SM-F966': 'Galaxy Z Fold 6', 'SM-F956': 'Galaxy Z Flip 6',
  'SM-F946': 'Galaxy Z Fold 5', 'SM-F731': 'Galaxy Z Flip 5',
  'SM-F936': 'Galaxy Z Fold 4', 'SM-F721': 'Galaxy Z Flip 4',
  // Samsung Galaxy A 系列
  'SM-A556': 'Galaxy A55', 'SM-A546': 'Galaxy A54', 'SM-A536': 'Galaxy A53',
  'SM-A356': 'Galaxy A35', 'SM-A346': 'Galaxy A34',
  // Huawei Mate 系列
  'ALN-AL': 'Mate 60 Pro', 'ALN-L': 'Mate 60', 'MNA-AL': 'Mate 50 Pro',
  'BRA-AL': 'Mate 60 Pro+', 'NOH-AN': 'Mate 40 Pro', 'OCE-AN': 'Mate 40',
  // Huawei P 系列 / Pura
  'HBP-AL': 'Pura 70 Ultra', 'HBN-AL': 'Pura 70 Pro', 'ADA-AL': 'P60 Pro',
  'ANA-AN': 'P40 Pro',
  // Honor
  'BVL-AN': 'Magic 6 Pro', 'PGT-AN': 'Magic 5 Pro', 'LGE-AN': 'Magic 4 Pro',
  'ANP-AN': 'Magic 6',
  // Xiaomi
  '2311DRK': 'Xiaomi 14 Pro', '23127PN': 'Xiaomi 14', '2312DRA': 'Xiaomi 14 Ultra',
  '2304FPN': 'Xiaomi 13 Ultra', '221113': 'Xiaomi 13', '221013': 'Xiaomi 13 Pro',
  '2407FPN': 'Xiaomi 15', '2410DPN': 'Xiaomi 15 Pro',
  // Redmi
  '2311DRN': 'Redmi K70 Pro', '23113RK': 'Redmi K70', '2312DRA2': 'Redmi Note 13 Pro+',
  '23090RA': 'Redmi Note 13 Pro',
  // OPPO
  'PHY110': 'Find X7 Ultra', 'PHZ110': 'Find X7', 'PGFM10': 'Find X6 Pro',
  'PHW110': 'Find X7', 'PJV110': 'Reno 11 Pro',
  // vivo
  'V2339A': 'X100 Pro', 'V2309A': 'X100', 'V2324A': 'X100 Ultra',
  'V2415A': 'X200 Pro', 'V2419A': 'X200',
  // OnePlus
  'PHB110': 'OnePlus 12', 'PJE110': 'OnePlus 11', 'CPH2581': 'OnePlus 12R',
  'CPH2573': 'OnePlus Nord 4',
  // Google Pixel
  'Pixel 9 Pro': 'Pixel 9 Pro', 'Pixel 9': 'Pixel 9', 'Pixel 8 Pro': 'Pixel 8 Pro',
  'Pixel 8': 'Pixel 8', 'Pixel 7 Pro': 'Pixel 7 Pro', 'Pixel 7': 'Pixel 7',
  'Pixel Fold': 'Pixel Fold', 'Pixel Tablet': 'Pixel Tablet',
  // iPhone / iPad (从 UA 解析，这里作精确映射)
  'iPhone16,2': 'iPhone 15 Pro Max', 'iPhone16,1': 'iPhone 15 Pro',
  'iPhone15,5': 'iPhone 15 Plus', 'iPhone15,4': 'iPhone 15',
  'iPhone15,3': 'iPhone 14 Pro Max', 'iPhone15,2': 'iPhone 14 Pro',
  'iPhone14,7': 'iPhone 14', 'iPhone14,8': 'iPhone 14 Plus',
  'iPad14,8': 'iPad Pro 12.9" M2', 'iPad14,9': 'iPad Pro 12.9" M2',
  'iPad14,3': 'iPad Pro 11" M2', 'iPad14,4': 'iPad Pro 11" M2',
  'iPad16,3': 'iPad Pro 11" M4', 'iPad16,4': 'iPad Pro 11" M4',
  'iPad16,5': 'iPad Pro 13" M4', 'iPad16,6': 'iPad Pro 13" M4',
  'iPad13,18': 'iPad Air M2', 'iPad13,19': 'iPad Air M2',
};

/**
 * 根据 Android 型号代码匹配商业名称
 */
function resolveAndroidModel(rawModel: string): string {
  if (!rawModel) return '';
  // 精确匹配
  for (const [code, name] of Object.entries(ANDROID_MODEL_MAP)) {
    if (rawModel.includes(code)) return name;
  }
  return rawModel; // 未知型号，返回原始型号代码
}

/**
 * 解析 Apple 设备型号 (如 iPhone16,2 → iPhone 15 Pro Max)
 */
function resolveAppleModel(rawModel: string): string {
  if (!rawModel) return '';
  if (ANDROID_MODEL_MAP[rawModel]) return ANDROID_MODEL_MAP[rawModel];
  return rawModel;
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
    colorDepth?: number;
    hardwareConcurrency?: number;
    deviceMemory?: number;
    maxTouchPoints?: number;
    timezone?: string;
    platformVersion?: string;
    deviceUUID?: string;
    ip?: string;
    xForwardedFor?: string;
  }): DeviceInfo {
    const ua = raw.userAgent || 'Unknown';
    const uaResult = UAParser(ua);

    // ========== 操作系统 ==========
    let osName = uaResult.os.name || 'Unknown';
    const osVersion = uaResult.os.version || '';

    // Windows 11 检测
    if (osName === 'Windows' && raw.platformVersion) {
      const majorPlatform = parseInt(raw.platformVersion.split('.')[0], 10);
      if (!isNaN(majorPlatform) && majorPlatform >= 13) {
        osName = 'Windows 11';
      }
    }

    const os = osVersion ? `${osName} ${osVersion}` : osName;

    // ========== 浏览器 ==========
    const browserName = uaResult.browser.name || 'Unknown';
    const browserVersion = uaResult.browser.version || '';
    const browser = browserVersion ? `${browserName} ${browserVersion.split('.')[0]}` : browserName;

    // ========== 设备类型 ==========
    const deviceType = uaResult.device.type || 'desktop';

    // ========== 设备型号 ==========
    let deviceModel = '';
    if (deviceType === 'mobile' || deviceType === 'tablet') {
      const rawModel = uaResult.device.model || uaResult.os.name || '';
      if (osName.includes('Android') || osName === 'Android') {
        deviceModel = resolveAndroidModel(rawModel);
      } else if (osName.includes('iOS') || osName === 'iOS' || osName.includes('Mac OS')) {
        // Apple 设备：尝试从 model 字段获取
        deviceModel = resolveAppleModel(rawModel);
      } else {
        deviceModel = rawModel;
      }
    }

    // ========== 设备名称 ==========
    const screen = raw.screenWidth && raw.screenHeight
      ? `${raw.screenWidth}×${raw.screenHeight}`
      : '';

    const deviceNameParts: string[] = [];
    if (deviceModel) deviceNameParts.push(deviceModel);
    deviceNameParts.push(os);

    // 桌面端显示 CPU 核数 + 内存
    if (deviceType === 'desktop') {
      const cpu = raw.hardwareConcurrency && raw.hardwareConcurrency > 0
        ? `${raw.hardwareConcurrency}核` : '';
      const ram = raw.deviceMemory && raw.deviceMemory > 0
        ? `${raw.deviceMemory}GB` : '';
      const hw = [cpu, ram].filter(Boolean).join('/');
      if (hw) deviceNameParts.pop(); // remove OS, merge with hw
      deviceNameParts.push(hw ? `${os} (${hw})` : os);
    }

    deviceNameParts.push(browser);
    if (screen) deviceNameParts.push(screen);
    const deviceName = deviceNameParts.join(' · ');

    // ========== 定位 ==========
    const ipAddress = this.extractClientIp(raw.ip, raw.xForwardedFor);
    const location = this.lookupLocation(ipAddress);
    const ipPrefix = ipAddress.includes('.')
      ? ipAddress.split('.').slice(0, 3).join('.')
      : '0.0.0';

    // ========== 设备指纹 Hash ==========
    // 三层降级：UUID（最强） > 浏览器指纹 + IP 段
    const deviceUUID = raw.deviceUUID || '';
    const browserFingerprint = crypto
      .createHash('sha256')
      .update(ua)
      .update(raw.platform || '')
      .update(String(raw.screenWidth || 0))
      .update(String(raw.screenHeight || 0))
      .update(String(raw.colorDepth || 0))
      .update(String(raw.hardwareConcurrency || 0))
      .update(String(raw.deviceMemory || 0))
      .update(String(raw.maxTouchPoints || 0))
      .update(raw.timezone || '')
      .update(raw.language || '')
      .digest('hex');

    const deviceHash = crypto
      .createHash('sha256')
      .update(deviceUUID || browserFingerprint)
      .update(ipPrefix)
      .digest('hex');

    return {
      deviceHash,
      deviceUUID,
      deviceName,
      deviceType,
      os,
      browser,
      deviceModel,
      ipAddress,
      location,
      userAgent: ua,
    };
  }

  /**
   * 获取或创建设备记录（同一设备不重复创建）
   */
  async getOrCreateDevice(userId: number, info: DeviceInfo) {
    const existing = await this.prisma.userDevice.findUnique({
      where: {
        userId_deviceHash: { userId, deviceHash: info.deviceHash },
      },
    });

    if (existing) {
      return this.prisma.userDevice.update({
        where: { id: existing.id },
        data: {
          deviceUUID: info.deviceUUID || existing.deviceUUID,
          deviceName: info.deviceName,
          deviceType: info.deviceType,
          ipAddress: info.ipAddress,
          location: info.location,
          isActive: true,
          lastSeenAt: new Date(),
        },
      });
    }

    const device = await this.prisma.userDevice.create({
      data: {
        userId,
        deviceHash: info.deviceHash,
        deviceUUID: info.deviceUUID || null,
        deviceName: info.deviceName,
        deviceType: info.deviceType,
        os: info.os,
        browser: info.browser,
        ipAddress: info.ipAddress,
        location: info.location,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    this.logger.log(
      `新设备登录: 用户${userId} | ${info.deviceName} | IP: ${info.ipAddress} | ${info.location || '未知位置'}`,
    );

    return device;
  }

  /**
   * 记录登录历史
   */
  async recordLogin(userId: number, deviceId: number | null, info: DeviceInfo, success = true) {
    return this.prisma.loginHistory.create({
      data: {
        userId,
        deviceId,
        ipAddress: info.ipAddress,
        location: info.location,
        userAgent: info.userAgent,
        success,
      },
    });
  }

  /**
   * 标记设备离线
   */
  async markDeviceOffline(userId: number, deviceHash: string) {
    try {
      await this.prisma.userDevice.updateMany({
        where: { userId, deviceHash, isActive: true },
        data: { isActive: false },
      });
    } catch (err: any) {
      this.logger.warn(`标记设备离线失败: ${err.message}`);
    }
  }

  async getUserDevices(userId: number) {
    return this.prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async getLoginHistory(userId: number, limit = 20) {
    return this.prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async revokeDevice(deviceId: number, userId: number) {
    const device = await this.prisma.userDevice.findFirst({
      where: { id: deviceId, userId },
    });
    if (!device) throw new Error('设备不存在');
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
      return directIp.replace(/^::ffff:/, '');
    }
    return '0.0.0.0';
  }

  private lookupLocation(ip: string): string | null {
    if (ip === '0.0.0.0' || ip === '127.0.0.1' || ip === '::1' ||
        ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      return '本地网络';
    }
    try {
      const geo = geoip.lookup(ip);
      if (geo) {
        const parts = [geo.city, geo.country].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : null;
      }
    } catch (err: any) {
      this.logger.warn(`GeoIP 查询失败: ${ip}`);
    }
    return null;
  }
}
