import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly tokenStats: TokenStats = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('DEEPSEEK_API_KEY') || '';
    this.apiUrl =
      this.configService.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com/v1/chat/completions';
  }

  getTokenStats(): TokenStats {
    return { ...this.tokenStats };
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
      content: `你是去中心化社交平台"DeSocial"的专属AI助手，仅以问答模式运行。

平台核心功能：
- 内容发布：用户可以发布文章(Article)和动态(Moment)
- 圈子(Circles)：创建和加入兴趣圈子
- 私信(Messages)：点对点加密通信，基于WebSocket实时连接
- IPFS存储：去中心化内容存储，通过Pinata网关访问
- P2P网络：点对点通信，基于libp2p协议
- 用户系统：注册/登录、个人主页、关注/粉丝、隐私设置
- 管理面板：用户管理、内容审核、数据统计

回复规则：
1. 仅回答与平台功能、使用方法、技术原理相关的问题
2. 对于超出平台范围的问题，礼貌地说明无法回答并引导用户回到平台话题
3. 回复保持简洁，控制在150字以内
4. 使用中文回复，语气友好专业
5. 不确定的答案请诚实说明，不要编造`,
    };

    try {
      if (!this.apiKey) {
        const demoResponse = this.getDemoResponse(messages[messages.length - 1]?.content || '');
        for (const char of demoResponse) {
          subscriber.next(char);
          await new Promise((r) => setTimeout(r, 30));
        }
        subscriber.complete();
        return;
      }

      const inputChars = systemMessage.content.length + messages.reduce((s, m) => s + m.content.length, 0);
      const estimatedInputTokens = Math.ceil(inputChars * 0.5);

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
          temperature: 0.5,
          max_tokens: 512,
          top_p: 0.9,
          frequency_penalty: 0.1,
          stop: ['\n\n\n'],
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let totalOutput = '';

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
            this.updateStats(estimatedInputTokens, Math.ceil(totalOutput.length * 0.5));
            subscriber.complete();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              totalOutput += content;
              subscriber.next(content);
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }

      this.updateStats(estimatedInputTokens, Math.ceil(totalOutput.length * 0.5));
      subscriber.complete();
    } catch (error) {
      this.logger.error('Chatbot stream error:', error);
      subscriber.error(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private updateStats(inputTokens: number, outputTokens: number): void {
    this.tokenStats.inputTokens += inputTokens;
    this.tokenStats.outputTokens += outputTokens;
    this.tokenStats.totalTokens = this.tokenStats.inputTokens + this.tokenStats.outputTokens;
    this.logger.log(`Token usage — Input: ${inputTokens}, Output: ${outputTokens}, Total session: ${this.tokenStats.totalTokens}`);
  }

  private getDemoResponse(userMessage: string): string {
    if (userMessage.includes('你好') || userMessage.includes('hi')) {
      return '你好！我是DeSocial平台的AI助手，专注于解答平台使用相关问题。有什么可以帮你的？';
    }
    if (userMessage.includes('功能') || userMessage.includes('什么')) {
      return 'DeSocial平台支持：内容发布（文章/动态）、圈子、私信（WebSocket加密）、IPFS去中心化存储、P2P通信、用户关注系统等。想了解哪个功能？';
    }
    return `这是演示模式回复。配置DEEPSEEK_API_KEY可启用AI回复。`;
  }
}
