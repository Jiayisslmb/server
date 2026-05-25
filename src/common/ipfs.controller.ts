import {
  Controller,
  Post,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IpfsService } from './utils/ipfs.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('ipfs')
export class IpfsController {
  constructor(private readonly ipfsService: IpfsService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { error: '未提供文件' };
    }

    const cid = await this.ipfsService.uploadFile(file.buffer, file.originalname);
    
    return {
      cid,
      url: this.ipfsService.getIPFSUrl(cid),
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  @Get('test')
  async testConnection() {
    const isConnected = await this.ipfsService.testConnection();
    return { connected: isConnected };
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  async getUsage() {
    return this.ipfsService.getUsage();
  }
}
