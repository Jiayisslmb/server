import { Controller, Post, Body, Res, Req } from '@nestjs/common';
import type { Response, Request } from 'express';
import { ChatbotService } from './chatbot.service';

interface SendMessageDto {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('message')
  async sendMessage(@Body() dto: SendMessageDto, @Res() res: Response, @Req() req: Request) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const subscription = this.chatbotService.sendMessageStream(dto.messages).subscribe({
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
}
