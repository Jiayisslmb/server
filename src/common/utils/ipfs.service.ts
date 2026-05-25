import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import fetch, { Response } from 'node-fetch';

interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);
  private readonly pinataApiKey: string;
  private readonly pinataApiSecret: string;
  private readonly pinataJwt: string;
  private readonly pinataGateway: string;
  private readonly ipfsGateways: string[];
  private currentGatewayIndex: number = 0;
  private readonly uploadTimeout: number = 60000;

  constructor(private configService: ConfigService) {
    this.pinataApiKey = this.configService.get<string>('PINATA_API_KEY') || '';
    this.pinataApiSecret = this.configService.get<string>('PINATA_API_SECRET') || '';
    this.pinataJwt = this.configService.get<string>('PINATA_JWT') || '';
    this.pinataGateway = this.configService.get<string>('PINATA_GATEWAY') || 'https://gateway.pinata.cloud/ipfs/';
    
    this.ipfsGateways = [this.pinataGateway];
  }

  private isConfigured(): boolean {
    return !!(this.pinataJwt || (this.pinataApiKey && this.pinataApiSecret));
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.pinataJwt) {
      headers['Authorization'] = `Bearer ${this.pinataJwt}`;
    } else {
      headers['pinata_api_key'] = this.pinataApiKey;
      headers['pinata_secret_api_key'] = this.pinataApiSecret;
    }

    return headers;
  }

  private async fetchWithTimeout(url: string, options: any, ms: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async uploadFile(file: Buffer, filename?: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new InternalServerErrorException('Pinata未配置，请设置环境变量 PINATA_JWT 或 PINATA_API_KEY 和 PINATA_API_SECRET');
    }

    try {
      const formData = new FormData();
      formData.append('file', file, filename || 'file');

      const metadata = JSON.stringify({
        name: filename || `upload-${Date.now()}`,
        keyvalues: {
          uploadedAt: new Date().toISOString(),
        }
      });
      formData.append('pinataMetadata', metadata);

      const options = JSON.stringify({
        cidVersion: 1,
      });
      formData.append('pinataOptions', options);

      const headers = this.getAuthHeaders();
      delete headers['Content-Type'];

      const response = await this.fetchWithTimeout('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          ...headers,
          ...formData.getHeaders(),
        },
        body: formData as any,
      }, this.uploadTimeout);

      if (!response.ok) {
        const error = await response.json() as any;
        throw new Error(error.error?.reason || `上传失败: ${response.status}`);
      }

      const result = (await response.json()) as PinataResponse;
      this.logger.log(`文件上传成功，CID: ${result.IpfsHash}`);
      
      return result.IpfsHash;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === '请求超时') {
        this.logger.error('Pinata上传超时');
        throw new InternalServerErrorException('文件上传超时，请检查网络连接或稍后重试');
      }
      this.logger.error('Pinata上传失败:', error);
      throw new InternalServerErrorException('文件上传到IPFS失败: ' + error.message);
    }
  }

  async uploadJSON(jsonData: object, name?: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new InternalServerErrorException('Pinata未配置');
    }

    try {
      const response = await this.fetchWithTimeout('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          pinataContent: jsonData,
          pinataMetadata: {
            name: name || `json-${Date.now()}`,
          },
          pinataOptions: {
            cidVersion: 1,
          },
        }),
      }, this.uploadTimeout);

      if (!response.ok) {
        const error = await response.json() as any;
        throw new Error(error.error?.reason || `上传失败: ${response.status}`);
      }

      const result = (await response.json()) as PinataResponse;
      this.logger.log(`JSON上传成功，CID: ${result.IpfsHash}`);
      
      return result.IpfsHash;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === '请求超时') {
        this.logger.error('Pinata JSON上传超时');
        throw new InternalServerErrorException('JSON上传超时，请检查网络连接或稍后重试');
      }
      this.logger.error('Pinata JSON上传失败:', error);
      throw new InternalServerErrorException('JSON上传到IPFS失败: ' + error.message);
    }
  }

  async getFile(cid: string): Promise<Buffer> {
    try {
      // 只使用Pinata网关
      for (const gateway of this.ipfsGateways) {
        try {
          const response = await this.fetchWithTimeout(`${gateway}${cid}`, {}, 15000);
          
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
          }
        } catch (err) {
          this.logger.warn(`网关 ${gateway} 获取失败`);
        }
      }

      throw new Error('Pinata网关无法获取文件');
    } catch (error: any) {
      this.logger.error('从IPFS获取文件失败:', error);
      throw new InternalServerErrorException('从IPFS获取文件失败: ' + error.message);
    }
  }

  getIPFSUrl(cid: string): string {
    // 优先使用Pinata网关（第一个），确保所有CID都使用同一个网关
    const gateway = this.ipfsGateways[0];
    return `${gateway}${cid}`;
  }

  // 随机选择一个网关
  getRandomGateway(): string {
    const randomIndex = Math.floor(Math.random() * this.ipfsGateways.length);
    return this.ipfsGateways[randomIndex];
  }

  async testConnection(): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn('Pinata未配置');
      return false;
    }

    try {
      const response = await this.fetchWithTimeout('https://api.pinata.cloud/data/testAuthentication', {
        headers: this.getAuthHeaders(),
      }, 10000);

      if (response.ok) {
        this.logger.log('Pinata连接测试成功');
        return true;
      } else {
        this.logger.error('Pinata认证失败');
        return false;
      }
    } catch (error: any) {
      this.logger.error('Pinata连接测试失败:', error);
      return false;
    }
  }

  async getUsage(): Promise<any> {
    if (!this.isConfigured()) {
      throw new InternalServerErrorException('Pinata未配置');
    }

    try {
      const response = await this.fetchWithTimeout('https://api.pinata.cloud/data/userPinnedDataTotal', {
        headers: this.getAuthHeaders(),
      }, 10000);

      if (!response.ok) {
        throw new Error('获取使用情况失败');
      }

      return await response.json();
    } catch (error: any) {
      this.logger.error('获取Pinata使用情况失败:', error);
      throw new InternalServerErrorException('获取使用情况失败: ' + error.message);
    }
  }

  async unpin(cid: string): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new InternalServerErrorException('Pinata未配置');
    }

    try {
      const response = await this.fetchWithTimeout(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      }, 10000);

      if (response.ok) {
        this.logger.log(`文件取消固定成功，CID: ${cid}`);
        return true;
      } else {
        this.logger.error(`文件取消固定失败，CID: ${cid}`);
        return false;
      }
    } catch (error: any) {
      this.logger.error('取消固定失败:', error);
      return false;
    }
  }
}
