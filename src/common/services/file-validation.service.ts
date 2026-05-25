import {
  Injectable,
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FileValidationOptions {
  maxSize?: number;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
}

export interface ImageValidationOptions extends FileValidationOptions {
  maxWidth?: number;
  maxHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

export interface VideoValidationOptions extends FileValidationOptions {
  maxDuration?: number;
}

export interface ValidatedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  extension: string;
}

@Injectable()
export class FileValidationService {
  private readonly logger = new Logger(FileValidationService.name);

  private readonly defaultMaxSize = 10 * 1024 * 1024;
  private readonly imageMaxSize = 5 * 1024 * 1024;
  private readonly videoMaxSize = 100 * 1024 * 1024;
  private readonly audioMaxSize = 20 * 1024 * 1024;

  private readonly allowedImageTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ];

  private readonly allowedVideoTypes = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
  ];

  private readonly allowedAudioTypes = [
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
  ];

  private readonly allowedDocumentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/markdown',
  ];

  private readonly dangerousExtensions = [
    '.exe',
    '.bat',
    '.cmd',
    '.sh',
    '.ps1',
    '.js',
    '.vbs',
    '.jar',
    '.msi',
    '.dll',
    '.scr',
    '.pif',
    '.com',
    '.hta',
    '.app',
    '.deb',
    '.rpm',
    '.dmg',
    '.pkg',
  ];

  constructor(private configService: ConfigService) {}

  validateImage(file: Express.Multer.File, options: ImageValidationOptions = {}): ValidatedFile {
    const maxSize = options.maxSize || this.imageMaxSize;
    const allowedMimeTypes = options.allowedMimeTypes || this.allowedImageTypes;

    this.validateFileSize(file, maxSize, '图片');
    this.validateMimeType(file, allowedMimeTypes, '图片');
    this.validateExtension(file, allowedMimeTypes);
    this.checkDangerousExtension(file);

    return this.createValidatedFile(file);
  }

  validateVideo(file: Express.Multer.File, options: VideoValidationOptions = {}): ValidatedFile {
    const maxSize = options.maxSize || this.videoMaxSize;
    const allowedMimeTypes = options.allowedMimeTypes || this.allowedVideoTypes;

    this.validateFileSize(file, maxSize, '视频');
    this.validateMimeType(file, allowedMimeTypes, '视频');
    this.validateExtension(file, allowedMimeTypes);
    this.checkDangerousExtension(file);

    return this.createValidatedFile(file);
  }

  validateAudio(file: Express.Multer.File, options: FileValidationOptions = {}): ValidatedFile {
    const maxSize = options.maxSize || this.audioMaxSize;
    const allowedMimeTypes = options.allowedMimeTypes || this.allowedAudioTypes;

    this.validateFileSize(file, maxSize, '音频');
    this.validateMimeType(file, allowedMimeTypes, '音频');
    this.validateExtension(file, allowedMimeTypes);
    this.checkDangerousExtension(file);

    return this.createValidatedFile(file);
  }

  validateDocument(file: Express.Multer.File, options: FileValidationOptions = {}): ValidatedFile {
    const maxSize = options.maxSize || this.defaultMaxSize;
    const allowedMimeTypes = options.allowedMimeTypes || this.allowedDocumentTypes;

    this.validateFileSize(file, maxSize, '文档');
    this.validateMimeType(file, allowedMimeTypes, '文档');
    this.validateExtension(file, allowedMimeTypes);
    this.checkDangerousExtension(file);

    return this.createValidatedFile(file);
  }

  validateAvatar(file: Express.Multer.File): ValidatedFile {
    const maxSize = 2 * 1024 * 1024;
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    this.validateFileSize(file, maxSize, '头像');
    this.validateMimeType(file, allowedMimeTypes, '头像');
    this.validateExtension(file, allowedMimeTypes);
    this.checkDangerousExtension(file);

    const buffer = file.buffer;
    if (buffer.length < 8) {
      throw new BadRequestException('无效的图片文件');
    }

    return this.createValidatedFile(file);
  }

  validateBackgroundImage(file: Express.Multer.File): ValidatedFile {
    const maxSize = 5 * 1024 * 1024;
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

    this.validateFileSize(file, maxSize, '背景图');
    this.validateMimeType(file, allowedMimeTypes, '背景图');
    this.validateExtension(file, allowedMimeTypes);
    this.checkDangerousExtension(file);

    return this.createValidatedFile(file);
  }

  validateFile(file: Express.Multer.File, options: FileValidationOptions = {}): ValidatedFile {
    const maxSize = options.maxSize || this.defaultMaxSize;
    const allAllowedTypes = [
      ...this.allowedImageTypes,
      ...this.allowedVideoTypes,
      ...this.allowedAudioTypes,
      ...this.allowedDocumentTypes,
    ];
    const allowedMimeTypes = options.allowedMimeTypes || allAllowedTypes;

    this.validateFileSize(file, maxSize, '文件');
    this.validateMimeType(file, allowedMimeTypes, '文件');
    this.validateExtension(file, allowedMimeTypes);
    this.checkDangerousExtension(file);

    return this.createValidatedFile(file);
  }

  private validateFileSize(file: Express.Multer.File, maxSize: number, fileType: string): void {
    if (file.size > maxSize) {
      const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2);
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      
      this.logger.warn(
        `文件大小超出限制: ${file.originalname} (${fileSizeMB}MB > ${maxSizeMB}MB)`,
      );
      
      throw new PayloadTooLargeException(
        `${fileType}大小超出限制，最大允许 ${maxSizeMB}MB`,
      );
    }
  }

  private validateMimeType(
    file: Express.Multer.File,
    allowedMimeTypes: string[],
    fileType: string,
  ): void {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      this.logger.warn(
        `不支持的文件类型: ${file.originalname} (${file.mimetype})`,
      );
      
      throw new UnsupportedMediaTypeException(
        `不支持的${fileType}类型: ${file.mimetype}`,
      );
    }
  }

  private validateExtension(
    file: Express.Multer.File,
    allowedMimeTypes: string[],
  ): void {
    const extension = this.getExtension(file.originalname).toLowerCase();
    const mimeToExtension: Record<string, string[]> = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'image/svg+xml': ['.svg'],
      'video/mp4': ['.mp4'],
      'video/webm': ['.webm'],
      'video/ogg': ['.ogv'],
      'video/quicktime': ['.mov'],
      'audio/mpeg': ['.mp3'],
      'audio/wav': ['.wav'],
      'audio/ogg': ['.ogg'],
      'audio/webm': ['.weba'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    };

    const expectedExtensions = mimeToExtension[file.mimetype] || [];
    if (expectedExtensions.length > 0 && !expectedExtensions.includes(`.${extension}`)) {
      this.logger.warn(
        `文件扩展名与MIME类型不匹配: ${file.originalname} (${file.mimetype})`,
      );
      
      throw new BadRequestException(
        `文件扩展名与内容类型不匹配，期望扩展名: ${expectedExtensions.join(', ')}`,
      );
    }
  }

  private checkDangerousExtension(file: Express.Multer.File): void {
    const extension = this.getExtension(file.originalname).toLowerCase();
    
    if (this.dangerousExtensions.includes(`.${extension}`)) {
      this.logger.warn(
        `检测到危险文件扩展名: ${file.originalname}`,
      );
      
      throw new BadRequestException(
        '不允许上传此类型的文件',
      );
    }
  }

  private getExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  private createValidatedFile(file: Express.Multer.File): ValidatedFile {
    return {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
      extension: this.getExtension(file.originalname),
    };
  }

  sanitizeFilename(filename: string): string {
    const sanitized = filename
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 255);

    return sanitized;
  }

  generateUniqueFilename(originalname: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = this.getExtension(originalname);
    const baseName = this.sanitizeFilename(originalname.replace(/\.[^/.]+$/, ''));

    return `${baseName}_${timestamp}_${random}.${extension}`;
  }

  getFileType(mimetype: string): 'image' | 'video' | 'audio' | 'document' | 'unknown' {
    if (this.allowedImageTypes.includes(mimetype)) return 'image';
    if (this.allowedVideoTypes.includes(mimetype)) return 'video';
    if (this.allowedAudioTypes.includes(mimetype)) return 'audio';
    if (this.allowedDocumentTypes.includes(mimetype)) return 'document';
    return 'unknown';
  }

  isImage(mimetype: string): boolean {
    return this.allowedImageTypes.includes(mimetype);
  }

  isVideo(mimetype: string): boolean {
    return this.allowedVideoTypes.includes(mimetype);
  }

  isAudio(mimetype: string): boolean {
    return this.allowedAudioTypes.includes(mimetype);
  }

  isDocument(mimetype: string): boolean {
    return this.allowedDocumentTypes.includes(mimetype);
  }
}
