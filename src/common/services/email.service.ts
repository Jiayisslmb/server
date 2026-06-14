import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private configService: ConfigService) {
    const host = this.configService.get('SMTP_HOST');
    const user = this.configService.get('SMTP_USER');
    const pass = this.configService.get('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(this.configService.get('SMTP_PORT') || '587'),
        secure: this.configService.get('SMTP_SECURE') === 'true',
        auth: { user, pass },
      });
      this.logger.log('邮件服务已配置');
    } else {
      this.logger.warn('SMTP 未配置，邮件功能将以模拟模式运行');
    }
  }

  async sendVerificationCode(email: string, code: string): Promise<boolean> {
    const subject = 'DeSocial - 邮箱验证码';
    const html = `
      <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
        <div style="background:linear-gradient(135deg,#6364FF,#8B83FF);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">DeSocial</h1>
        </div>
        <div style="padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="font-size:16px;color:#333;">你的验证码是：</p>
          <div style="text-align:center;margin:24px 0;">
            <span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#6364FF;background:#F0EFFF;padding:12px 24px;border-radius:8px;">${code}</span>
          </div>
          <p style="font-size:14px;color:#666;">验证码 5 分钟内有效，请勿转发给他人。</p>
        </div>
      </div>`;

    return this.send(email, subject, html);
  }

  async sendPasswordResetCode(email: string, code: string): Promise<boolean> {
    const subject = 'DeSocial - 密码重置验证码';
    const html = `
      <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
        <div style="background:linear-gradient(135deg,#6364FF,#8B83FF);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">重置密码</h1>
        </div>
        <div style="padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="font-size:16px;color:#333;">你的密码重置验证码是：</p>
          <div style="text-align:center;margin:24px 0;">
            <span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#6364FF;background:#F0EFFF;padding:12px 24px;border-radius:8px;">${code}</span>
          </div>
          <p style="font-size:14px;color:#666;">验证码 5 分钟内有效。如果你没有请求重置密码，请忽略此邮件。</p>
        </div>
      </div>`;

    return this.send(email, subject, html);
  }

  private async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`[模拟] 发送邮件到 ${to}: ${subject}`);
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: this.configService.get('SMTP_FROM') || 'noreply@desocial.top',
        to,
        subject,
        html,
      });
      this.logger.log(`邮件已发送到 ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`邮件发送失败: ${error.message}`);
      return false;
    }
  }
}
