import { Controller, Post, Get, Delete, Patch, Body, Res, Req, Param, UseGuards, Request, Query } from '@nestjs/common';
import type { Response } from 'express';
import type { Request as ExpressRequest } from 'express';
import { ChatbotService } from './chatbot.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PrismaService } from 'src/config/prisma.service';
import { CreateConversationDto, UpdateProfileDto } from './dto/chatbot.dto';

interface SendMessageDto {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

@Controller('chatbot')
export class ChatbotController {
  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('message')
  @UseGuards(JwtAuthGuard)
  async sendMessage(
    @Body() dto: SendMessageDto & { conversationId?: number; mode?: string },
    @Res() res: Response,
    @Request() req: any,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const userId = req.user?.id;
    const subscription = this.chatbotService.sendMessageStream(dto.messages, {
      userId,
      conversationId: dto.conversationId,
      mode: dto.mode as 'fast' | 'deep' | 'auto' | undefined,
    }).subscribe({
      next: (chunk: string) => {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      },
      error: (err: Error) => {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      },
      complete: () => {
        res.write('data: [DONE]\n\n');
        res.end();
      },
    });

    req.on('close', () => subscription.unsubscribe());
  }

  // Get conversation list
  @Get('conversations')
  @UseGuards(JwtAuthGuard)
  async getConversations(@Request() req: any) {
    return this.chatbotService.getConversations(req.user.id);
  }

  // Get conversation messages
  @Get('conversations/:id')
  @UseGuards(JwtAuthGuard)
  async getConversation(@Param('id') id: string, @Request() req: any) {
    return this.chatbotService.getConversationMessages(parseInt(id));
  }

  // Delete conversation
  @Delete('conversations/:id')
  @UseGuards(JwtAuthGuard)
  async deleteConversation(@Param('id') id: string, @Request() req: any) {
    return this.chatbotService.deleteConversation(parseInt(id), req.user.id);
  }

  // Get available models
  @Get('models')
  async getModels() {
    return {
      text: [
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', type: 'text', mode: 'deep' },
        { id: 'deepseek-chat', name: 'DeepSeek Chat', type: 'text', mode: 'fast' },
      ],
      multimodal: [
        { id: 'qwen-vl-max', name: '通义千问 VL Max', type: 'vision' },
      ],
      image: [
        { id: 'wanx-v1', name: '通义万相', type: 'generation' },
      ],
    };
  }

  // Get AI profile
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: any) {
    return this.chatbotService.getUserProfile(req.user.id);
  }

  // Update AI profile
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.chatbotService.updateUserProfile(req.user.id, dto);
  }

  // Get token usage stats
  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getStats(@Request() req: any) {
    // Count tokens from user's messages
    const stats = await this.prisma.aiMessage.findMany({
      where: { conversation: { userId: req.user.id } },
      select: { tokenInput: true, tokenOutput: true, createdAt: true },
    });

    const now = new Date();
    const thisMonth = stats.filter(s => {
      const d = new Date(s.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    return {
      thisMonth: {
        input: thisMonth.reduce((sum, s) => sum + (s.tokenInput || 0), 0),
        output: thisMonth.reduce((sum, s) => sum + (s.tokenOutput || 0), 0),
      },
      total: {
        input: stats.reduce((sum, s) => sum + (s.tokenInput || 0), 0),
        output: stats.reduce((sum, s) => sum + (s.tokenOutput || 0), 0),
      },
    };
  }
}
