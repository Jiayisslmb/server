import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('DEEPSEEK_API_KEY') || '';
    this.apiUrl =
      this.configService.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com/v1/chat/completions';
  }

  sendMessageStream(messages: ChatMessage[]): Observable<string> {
    return new Observable((subscriber) => {
      this.streamChat(messages, subscriber);
    });
  }

  private async streamChat(
    messages: ChatMessage[],
    subscriber: { next: (chunk: string) => void; complete: () => void; error: (err: Error) => void },
  ) {
    const systemMessage: ChatMessage = {
      role: 'system',
      content: '你是一个去中心化社交平台的AI助手。你可以帮助用户了解平台功能、解答问题、提供使用建议。请用中文回复，保持友好、专业的语气。回复长度适中，不要过于冗长。',
    };

    try {
      if (!this.apiKey) {
        // Demo mode: simulate streaming response
        const demoResponse = this.getDemoResponse(messages[messages.length - 1]?.content || '');
        for (const char of demoResponse) {
          subscriber.next(char);
          await new Promise((r) => setTimeout(r, 30));
        }
        subscriber.complete();
        return;
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-v4-pro',
          messages: [systemMessage, ...messages],
          stream: true,
          temperature: 0.7,
          max_tokens: 2048,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            subscriber.complete();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              subscriber.next(content);
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }

      subscriber.complete();
    } catch (error) {
      this.logger.error('Chatbot stream error:', error);
      subscriber.error(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private getDemoResponse(userMessage: string): string {
    if (userMessage.includes('你好') || userMessage.includes('hi')) {
      return '你好！我是平台的AI助手，有什么可以帮你的吗？😊';
    }
    if (userMessage.includes('功能') || userMessage.includes('什么')) {
      return '这个去中心化社交平台支持以下功能：\n\n1. **内容发布** — 发布文章和动态\n2. **圈子** — 创建和加入兴趣圈子\n3. **私信** — 点对点加密通信\n4. **IPFS存储** — 去中心化内容存储\n5. **P2P网络** — 点对点通信\n\n有什么想详细了解的吗？';
    }
    return `收到你的消息！这是一个演示回复。要获得真实的AI回复，请在 \`.env\` 文件中配置 \`DEEPSEEK_API_KEY\`。

当前消息: "${userMessage.slice(0, 50)}${userMessage.length > 50 ? '...' : ''}"`;
  }
}
