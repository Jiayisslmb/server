import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { PrismaService } from '../../config/prisma.service';
import { RedisService } from '../../config/redis.service';
import { join } from 'path';

// ── LanceDB: try require first, fall back to dynamic import ──────────────
let lancedb: any;
try {
  lancedb = require('@lancedb/lancedb');
} catch {
  // will attempt dynamic import at connection time
}

// ── Interfaces ────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrl?: string;
}

interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface SendMessageOptions {
  userId?: number;
  conversationId?: number;
  mode?: 'fast' | 'deep' | 'auto';
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ── Function Calling Tool Definitions (all read‑only) ─────────────────────

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_posts',
      description:
        '搜索DeSocial平台上的文章和动态帖子。可根据关键词查找相关内容。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词' },
          type: {
            type: 'string',
            enum: ['article', 'moment', 'all'],
            description: '内容类型',
          },
          limit: { type: 'integer', description: '返回条数', default: 5 },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_trending_topics',
      description: '获取DeSocial平台当前热门话题列表。',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: '返回话题数量', default: 10 },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_user_info',
      description: '根据用户名或ID查询DeSocial平台用户的基本信息。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '用户名或用户ID' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_users',
      description: '模糊搜索DeSocial平台用户，支持按昵称、用户名关键词搜索。返回匹配的用户列表。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词' },
          limit: { type: 'integer', description: '返回数量', default: 10 },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_user_profile',
      description: '获取指定用户的详细公开信息，包括头像URL、背景URL、个人简介、统计数据。返回头像URL可供视觉识别。',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'integer', description: '用户ID' },
        },
        required: ['userId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_circles',
      description: '查询DeSocial平台上的圈子列表，可按分类筛选。',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: '圈子分类' },
          limit: { type: 'integer', description: '返回数量', default: 5 },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_help_docs',
      description: '获取DeSocial平台的帮助文档和使用指南。',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: '帮助主题，如 account、publish、privacy、ipfs',
          },
        },
      },
    },
  },
];

// Allowed tool names — anything else is a hallucinated write-tool
const ALLOWED_TOOLS = new Set(TOOLS.map((t) => t.function.name));

// ── Base System Prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `你是去中心化社交平台"DeSocial"的专属AI助手。

平台核心功能：
- 内容发布：用户可以发布文章(Article)和动态(Moment)，支持富文本和媒体
- 圈子(Circles)：创建和加入兴趣圈子，在圈子内交流讨论
- 私信(Messages)：点对点加密通信，基于WebSocket实时连接
- IPFS存储：去中心化内容存储，通过Pinata网关访问
- P2P网络：点对点通信，基于libp2p协议
- 用户系统：注册/登录、个人主页、关注/粉丝、隐私设置
- 话题标签：文章和动态可关联话题，发现热门内容
- 通知系统：点赞、评论、关注等实时通知
- 管理面板：用户管理、内容审核、数据统计

回复规则：
1. 仅回答与平台功能、使用方法、技术原理相关的问题
2. 对于超出平台范围的问题，礼貌地说明无法回答并引导用户回到平台话题
3. 使用中文回复，语气友好专业
4. 不确定的答案请诚实说明，不要编造
5. 可以调用提供的工具函数来获取平台实时数据`;

// ── Knowledge Base Seed Data ───────────────────────────────────────────────

const KNOWLEDGE_SEEDS: Array<{
  id: string;
  title: string;
  content: string;
  source: string;
}> = [
  {
    id: 'kb-001',
    title: 'DeSocial平台简介',
    content:
      'DeSocial是一个去中心化社交平台，旨在为用户提供不受中心化机构控制的社交体验。平台基于区块链技术和IPFS分布式存储，确保用户数据的安全性和隐私性。用户可以发布文章、动态，加入圈子，发送私信，所有内容通过IPFS存储。',
    source: 'platform-docs',
  },
  {
    id: 'kb-002',
    title: '如何发布文章',
    content:
      '在DeSocial平台发布文章：登录后点击"发布"按钮，选择"文章"类型。填写标题、正文内容，可选择添加封面图片和标签。文章支持富文本编辑，可插入图片和链接。发布时可选择可见范围：公开、仅关注者、仅圈子成员。文章发布后会存储在IPFS网络中。',
    source: 'help-center',
  },
  {
    id: 'kb-003',
    title: 'IPFS存储说明',
    content:
      'DeSocial使用IPFS（星际文件系统）进行去中心化内容存储。上传到平台的图片和文件会通过Pinata网关固定到IPFS网络，生成唯一的CID（内容标识符）。这意味着您的内容不会因为单一服务器故障而丢失，真正实现数据主权归用户所有。',
    source: 'platform-docs',
  },
  {
    id: 'kb-004',
    title: '圈子功能指南',
    content:
      '圈子是DeSocial平台上基于兴趣的社群功能。用户可以创建圈子（设置名称、描述、分类和头像），也可以加入感兴趣的圈子。圈子支持多种分类：技术、艺术、音乐、游戏、体育、生活等。在圈子内发布的文章只有圈子成员可见。圈主可以设置管理员协助管理。',
    source: 'help-center',
  },
  {
    id: 'kb-005',
    title: '私信与WebSocket通信',
    content:
      'DeSocial的私信功能基于WebSocket实时通信和端到端加密。当双方同时在线时，消息通过WebSocket实时传递；离线消息会暂存并在对方上线时推送。私信支持文本、图片和文件传输。用户可在隐私设置中控制谁可以给自己发私信（所有人、关注者、无人）。',
    source: 'platform-docs',
  },
  {
    id: 'kb-006',
    title: '隐私设置详解',
    content:
      'DeSocial提供丰富的隐私控制选项：可设置是否允许他人关注、是否允许私信、是否隐藏关注列表、是否隐藏粉丝列表、是否隐藏点赞记录、是否隐藏收藏。此外，每篇文章和动态都可以单独设置可见范围。平台还支持屏蔽用户功能。',
    source: 'help-center',
  },
  {
    id: 'kb-007',
    title: '用户注册与登录',
    content:
      '注册DeSocial账号支持多种方式：邮箱注册（需要验证邮箱）、GitHub OAuth登录。注册时需要设置用户名和密码，密码经过bcrypt加密存储。平台支持双因素认证(MFA)，可在安全设置中开启。支持密码找回功能，通过邮箱发送重置链接。',
    source: 'help-center',
  },
  {
    id: 'kb-008',
    title: '关注与粉丝系统',
    content:
      '用户可以关注感兴趣的其他用户，成为其粉丝。关注后，被关注用户发布的公开内容会出现在您的信息流中。关注关系可以随时取消。用户可在隐私设置中选择是否隐藏自己的关注列表和粉丝列表，以及是否允许新粉丝关注自己。',
    source: 'help-center',
  },
  {
    id: 'kb-009',
    title: '内容互动功能',
    content:
      'DeSocial支持多种内容互动方式：点赞（对文章和动态表达喜欢）、评论（对内容发表看法，支持嵌套回复）、转发（分享内容到自己的主页）、收藏（保存感兴趣的内容以便稍后查看）。用户可在隐私设置中隐藏自己的点赞和收藏记录。',
    source: 'help-center',
  },
  {
    id: 'kb-010',
    title: '话题标签系统',
    content:
      '话题标签帮助用户发现感兴趣的内容。发布文章或动态时可以关联已有话题或创建新话题。话题页面聚合了所有关联该话题的内容，按热度排序。热门话题会显示在平台首页，帮助用户了解当前社区讨论焦点。',
    source: 'platform-docs',
  },
  {
    id: 'kb-011',
    title: '通知系统',
    content:
      '平台提供实时通知功能，当有人点赞、评论、关注或转发了你的内容时，会收到通知。通知分为多种类型：点赞通知、评论通知、关注通知、转发通知、系统通知。通知页面支持标记已读/未读，以及清空所有通知。',
    source: 'help-center',
  },
  {
    id: 'kb-012',
    title: '管理面板功能',
    content:
      '平台管理员可通过管理面板进行：用户管理（查看、冻结、解冻用户账号）、内容审核（审查违规文章和动态）、数据统计（查看平台用户增长、内容发布趋势等图表数据）。管理员操作会记录到审计日志中，确保操作可追溯。',
    source: 'platform-docs',
  },
  {
    id: 'kb-013',
    title: 'P2P网络与libp2p',
    content:
      'DeSocial的P2P网络基于libp2p协议构建，支持节点之间的直接通信。用户可以通过P2P网络发现其他在线节点，进行点对点的数据传输，无需经过中心化服务器中转。这进一步增强了平台的去中心化特性。',
    source: 'platform-docs',
  },
  {
    id: 'kb-014',
    title: '内容审核机制',
    content:
      '平台设有内容举报机制，用户可以对违规内容进行举报。举报需要选择类型（文章/动态/评论/用户）并填写举报原因。管理员在后台审核举报并做出处理（忽略/删除内容/冻结用户）。平台致力于维护健康友善的社区环境。',
    source: 'help-center',
  },
  {
    id: 'kb-015',
    title: '个性化设置',
    content:
      '用户可以在设置页面进行个性化配置：修改昵称、个人简介、头像、背景图片、网站链接、所在地。外观设置支持浅色/深色主题切换、字体大小调整（小/中/大）。内容设置可配置默认可见范围。通知设置可选择性开启或关闭各类通知。',
    source: 'help-center',
  },
];

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ChatbotService implements OnModuleInit {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly deepseekApiKey: string;
  private readonly deepseekApiUrl: string;
  private readonly dashscopeApiKey: string;
  private readonly tokenStats: TokenStats = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  // LanceDB
  private db: any = null;
  private documentsTable: any = null;
  private lancedbReady = false;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    this.deepseekApiKey = this.configService.get<string>('DEEPSEEK_API_KEY') || '';
    this.deepseekApiUrl =
      this.configService.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com/v1/chat/completions';
    this.dashscopeApiKey = this.configService.get<string>('DASHSCOPE_API_KEY') || '';
  }

  async onModuleInit() {
    await this.initLanceDB();
    await this.seedKnowledgeBase();
  }

  // ── LanceDB Initialization ─────────────────────────────────────────────

  private async initLanceDB() {
    try {
      // If require failed, try dynamic import
      if (!lancedb) {
        try {
          const mod = await import('@lancedb/lancedb');
          lancedb = mod.default || mod;
        } catch {
          this.logger.warn('LanceDB dynamic import failed, RAG will be disabled');
          return;
        }
      }

      const dbPath = join(process.cwd(), '.lancedb');
      this.db = await lancedb.connect(dbPath);
      this.logger.log(`LanceDB connected at ${dbPath}`);
      this.lancedbReady = true;
    } catch (err) {
      this.logger.warn(`LanceDB connection failed: ${err instanceof Error ? err.message : err}, RAG disabled`);
      this.lancedbReady = false;
    }
  }

  // ── Knowledge Base Seeding ──────────────────────────────────────────────

  private async seedKnowledgeBase() {
    if (!this.lancedbReady || !this.db) return;

    try {
      // Check if table exists and has data
      try {
        this.documentsTable = await this.db.openTable('documents');
        const count = await this.documentsTable.countRows();
        if (count > 0) {
          this.logger.log(`LanceDB 'documents' table ready with ${count} rows`);
          return;
        }
      } catch {
        // Table doesn't exist, create it
      }

      this.logger.log('Seeding LanceDB knowledge base...');

      // Generate embeddings for each document
      const rows: Array<{
        id: string;
        title: string;
        content: string;
        source: string;
        vector: number[];
      }> = [];

      for (const doc of KNOWLEDGE_SEEDS) {
        try {
          const embedding = await this.embedText(doc.content);
          if (embedding.length > 0) {
            rows.push({
              id: doc.id,
              title: doc.title,
              content: doc.content,
              source: doc.source,
              vector: embedding,
            });
          }
        } catch (err) {
          this.logger.warn(`Failed to embed doc ${doc.id}: ${err instanceof Error ? err.message : err}`);
        }
      }

      if (rows.length > 0) {
        if (this.documentsTable) {
          await this.documentsTable.add(rows);
        } else {
          this.documentsTable = await this.db.createTable('documents', rows, { mode: 'overwrite' });
        }
        this.logger.log(`Seeded ${rows.length} documents into LanceDB`);
      }
    } catch (err) {
      this.logger.warn(`Knowledge base seeding failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Text Embedding via DashScope ─────────────────────────────────────────

  private async embedText(text: string): Promise<number[]> {
    if (!this.dashscopeApiKey) {
      this.logger.warn('DASHSCOPE_API_KEY not configured, cannot embed text');
      return [];
    }

    try {
      const response = await fetch(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.dashscopeApiKey}`,
          },
          body: JSON.stringify({
            model: 'text-embedding-v3',
            input: text,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status}`);
      }

      const data = await response.json();
      const embedding = data?.data?.[0]?.embedding;
      return Array.isArray(embedding) ? embedding : [];
    } catch (err) {
      this.logger.error(`Embedding failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  // ── LanceDB RAG Search ───────────────────────────────────────────────────

  private async searchDocuments(query: string, limit = 3): Promise<string[]> {
    if (!this.lancedbReady || !this.documentsTable) {
      // LanceDB not available, use keyword fallback
      return this.keywordFallbackSearch(query, limit);
    }

    try {
      const embedding = await this.embedText(query);
      if (embedding.length === 0) {
        // Embedding failed, fall back to keyword matching
        this.logger.warn('Embedding returned empty, using keyword fallback');
        return this.keywordFallbackSearch(query, limit);
      }

      const results = await this.documentsTable
        .search(embedding)
        .limit(limit)
        .toArray();

      return (results || []).map(
        (r: any) =>
          `【${r.title || ''}】${(r.content || '').substring(0, 300)}`,
      );
    } catch (err) {
      this.logger.warn(
        `Document search failed: ${err instanceof Error ? err.message : err}, using keyword fallback`,
      );
      return this.keywordFallbackSearch(query, limit);
    }
  }

  // ── Keyword-based fallback search (when embeddings/LanceDB unavailable) ──

  private keywordFallbackSearch(query: string, limit = 3): string[] {
    const words = query
      .split(/[\s,，。！？、]+/)
      .filter((w) => w.length > 0);
    if (words.length === 0) return [];

    const scored: Array<{
      id: string;
      title: string;
      content: string;
      source: string;
      score: number;
    }> = [];

    for (const doc of KNOWLEDGE_SEEDS) {
      let score = 0;
      const titleLower = doc.title.toLowerCase();
      const contentLower = doc.content.toLowerCase();

      for (const word of words) {
        const wordLower = word.toLowerCase();
        if (titleLower.includes(wordLower)) score += 3;
        if (contentLower.includes(wordLower)) score += 1;
      }

      if (score > 0) {
        scored.push({ ...doc, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored
      .slice(0, limit)
      .map((r) => `【${r.title}】${r.content.substring(0, 300)}`);
  }

  // ── Query Classification ─────────────────────────────────────────────────

  private classifyQuery(message: string): 'fast' | 'deep' {
    const trimmed = message.trim();
    // Simple greetings or very short queries → fast
    if (trimmed.length < 15) {
      const greetings = [
        '你好', 'hi', 'hello', '嗨', '在吗', '在么', 'hey',
        '您好', '早上好', '晚上好', '下午好', 'good', '谢谢', '感谢',
        '嗯', '哦', '好', '行', 'ok', 'OK', 'Ok',
      ];
      const lower = trimmed.toLowerCase();
      if (greetings.some((g) => lower.includes(g))) {
        return 'fast';
      }
    }
    return 'deep';
  }

  // ── Image Detection ──────────────────────────────────────────────────────

  private hasImageInput(messages: ChatMessage[]): boolean {
    return messages.some((m) => !!m.imageUrl);
  }

  private isImageGenerationRequest(messages: ChatMessage[]): boolean {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user') return false;
    const content = last.content.toLowerCase();
    const genKeywords = [
      '生成', '画', '绘制', '创建图片', '生成图片', '生成图像',
      'generate image', 'create image', 'draw', 'make a picture',
      'generate a picture', '生成一张', '画一张', '画一个',
    ];
    return genKeywords.some((kw) => content.includes(kw));
  }

  // ── User Profile ─────────────────────────────────────────────────────────

  async getUserProfile(userId: number) {
    let profile = await this.prisma.aiUserProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      profile = await this.prisma.aiUserProfile.create({
        data: { userId, language: 'zh-CN', interests: '', expertise: '' },
      });
    }
    return profile;
  }

  async updateUserProfile(userId: number, data: { language?: string; interests?: string; expertise?: string }) {
    return this.prisma.aiUserProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  // ── System Prompt Builder ────────────────────────────────────────────────

  private async buildSystemPrompt(
    userId?: number,
    ragContext?: string[],
  ): Promise<string> {
    let prompt = SYSTEM_PROMPT_BASE;

    // Append RAG context
    if (ragContext && ragContext.length > 0) {
      prompt += '\n\n参考知识库：\n' + ragContext.map((c, i) => `${i + 1}. ${c}`).join('\n');
    }

    // Append user profile
    if (userId) {
      try {
        const profile = await this.getUserProfile(userId);
        const parts: string[] = [];
        if (profile.interests) {
          parts.push(`用户兴趣：${profile.interests}`);
        }
        if (profile.expertise) {
          parts.push(`用户专业领域：${profile.expertise}`);
        }
        if (profile.language && profile.language !== 'zh-CN') {
          parts.push(`用户偏好语言：${profile.language}`);
        }
        if (parts.length > 0) {
          prompt += '\n\n用户信息：\n' + parts.join('\n');
        }
      } catch {
        // profile fetch failed, skip
      }
    }

    // Keep under 2000 chars
    if (prompt.length > 2000) {
      prompt = prompt.substring(0, 1997) + '...';
    }

    return prompt;
  }

  // ── Token Estimation ─────────────────────────────────────────────────────

  private estimateTokens(text: string): number {
    let tokens = 0;
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code < 128) {
        // ASCII: ~0.25 tokens per char
        tokens += 0.25;
      } else {
        // CJK and other Unicode: ~0.5 tokens per char
        tokens += 0.5;
      }
    }
    return Math.ceil(tokens);
  }

  // ── Token Stats ──────────────────────────────────────────────────────────

  getTokenStats(): TokenStats {
    return { ...this.tokenStats };
  }

  private updateStats(inputTokens: number, outputTokens: number): void {
    this.tokenStats.inputTokens += inputTokens;
    this.tokenStats.outputTokens += outputTokens;
    this.tokenStats.totalTokens = this.tokenStats.inputTokens + this.tokenStats.outputTokens;
    this.logger.log(
      `Token usage — Input: ${inputTokens}, Output: ${outputTokens}, Session total: ${this.tokenStats.totalTokens}`,
    );
  }

  // ── Conversation Persistence ─────────────────────────────────────────────

  async createConversation(userId: number, title: string, model = 'deepseek-v4-pro') {
    return this.prisma.aiConversation.create({
      data: { userId, title, model },
    });
  }

  async getConversations(userId: number) {
    return this.prisma.aiConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } },
    });
  }

  async getConversationMessages(conversationId: number, limit = 50) {
    return this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async deleteConversation(conversationId: number, userId: number) {
    const conv = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv || conv.userId !== userId) {
      throw new Error('Conversation not found or access denied');
    }
    return this.prisma.aiConversation.delete({
      where: { id: conversationId },
    });
  }

  private async saveMessage(
    conversationId: number,
    role: string,
    content: string,
    tokenInput?: number,
    tokenOutput?: number,
    imageUrl?: string,
  ) {
    return this.prisma.aiMessage.create({
      data: {
        conversationId,
        role,
        content,
        tokenInput: tokenInput ?? null,
        tokenOutput: tokenOutput ?? null,
        imageUrl: imageUrl ?? null,
      },
    });
  }

  // ── Main Entry Point ─────────────────────────────────────────────────────

  sendMessageStream(
    messages: ChatMessage[],
    options?: SendMessageOptions,
  ): Observable<string> {
    return new Observable((subscriber) => {
      this.streamChat(messages, subscriber, options).catch((err) => {
        this.logger.error('Chatbot stream error:', err);
        subscriber.error(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  // ── Core Stream Handler ──────────────────────────────────────────────────

  private async streamChat(
    messages: ChatMessage[],
    subscriber: { next: (chunk: string) => void; complete: () => void; error: (err: Error) => void },
    options?: SendMessageOptions,
  ) {
    const userId = options?.userId;
    let conversationId = options?.conversationId;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const queryText = lastUserMsg?.content || '';

    // Auto-create conversation if userId present but no conversationId
    if (userId && !conversationId) {
      try {
        const title = queryText.slice(0, 30) || '新对话';
        const conv = await this.createConversation(userId, title);
        conversationId = conv.id;
        // Send conversationId to frontend
        subscriber.next(JSON.stringify({ conversationId: conv.id }));
      } catch (err) {
        this.logger.warn('Auto-create conversation failed:', err);
      }
    }

    // ── Route: Image Generation → Wanx ──────────────────────────────────
    if (this.dashscopeApiKey && this.isImageGenerationRequest(messages)) {
      try {
        subscriber.next('🔍 正在生成图片...');
        const imageUrl = await this.generateImage(queryText);
        const responseText = `已为你生成图片：\n\n![生成的图片](${imageUrl})`;
        subscriber.next(responseText);
        if (conversationId) {
          await this.saveMessage(conversationId, 'user', queryText, this.estimateTokens(queryText), 0);
          await this.saveMessage(conversationId, 'assistant', responseText, 0, this.estimateTokens(responseText), imageUrl);
        }
        subscriber.complete();
        return;
      } catch (err) {
        this.logger.warn(`Image generation failed, falling back to text: ${err instanceof Error ? err.message : err}`);
        subscriber.next('（图片生成暂时不可用，我将以文字回复你）\n');
      }
    }

    // ── Route: Image Understanding → Qwen-VL ────────────────────────────
    if (this.dashscopeApiKey && this.hasImageInput(messages)) {
      await this.streamQwenVL(messages, subscriber, options);
      return;
    }

    // ── Route: Pure Text → DeepSeek (fast or deep) ──────────────────────
    const mode = options?.mode === 'fast' ? 'fast'
      : options?.mode === 'deep' ? 'deep'
      : this.classifyQuery(queryText);

    // RAG context (deep mode only)
    let ragContext: string[] = [];
    if (mode === 'deep') {
      ragContext = await this.searchDocuments(queryText, 3);
    }

    const systemPrompt = await this.buildSystemPrompt(
      mode === 'deep' ? userId : undefined,
      ragContext,
    );

    const model = mode === 'fast' ? 'deepseek-chat' : 'deepseek-v4-pro';
    const maxTokens = mode === 'fast' ? 150 : 512;
    const useTools = mode === 'deep';

    if (!this.deepseekApiKey) {
      // Demo / fallback mode
      const demoResponse = this.getDemoResponse(queryText);
      for (const char of demoResponse) {
        subscriber.next(char);
        await this.delay(30);
      }
      subscriber.complete();
      return;
    }

    const systemMsg: ChatMessage = { role: 'system', content: systemPrompt };

    // Estimate input tokens
    const inputChars =
      systemPrompt.length +
      messages.reduce((s, m) => s + m.content.length + (m.imageUrl ? 50 : 0), 0);
    const estimatedInputTokens = this.estimateTokens(systemPrompt) +
      messages.reduce((s, m) => s + this.estimateTokens(m.content), 0);

    await this.streamDeepSeek(
      systemMsg,
      messages,
      model,
      maxTokens,
      useTools,
      estimatedInputTokens,
      subscriber,
      conversationId,
      queryText,
      mode,
      userId,
    );
  }

  // ── DeepSeek Streaming ───────────────────────────────────────────────────

  private async streamDeepSeek(
    systemMsg: ChatMessage,
    messages: ChatMessage[],
    model: string,
    maxTokens: number,
    useTools: boolean,
    estimatedInputTokens: number,
    subscriber: { next: (chunk: string) => void; complete: () => void; error: (err: Error) => void },
    conversationId: number | undefined,
    queryText: string,
    mode: string,
    userId: number | undefined,
    recursionDepth = 0,
  ) {
    const MAX_RECURSION = 3; // Prevent infinite tool-call loops

    const requestBody: any = {
      model,
      messages: [
        systemMsg,
        ...messages.filter((m) => m.role !== 'system').map((m) => ({
          role: m.role,
          content: m.imageUrl
            ? `${m.content}\n[图片: ${m.imageUrl}]`
            : m.content,
        })),
      ],
      stream: true,
      max_tokens: maxTokens,
      temperature: mode === 'fast' ? 0.7 : 0.5,
      top_p: 0.9,
    };

    if (useTools) {
      requestBody.tools = TOOLS;
      requestBody.tool_choice = 'auto';
    }

    try {
      const response = await fetch(this.deepseekApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.deepseekApiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`DeepSeek API error ${response.status}: ${errText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let totalOutput = '';
      let toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();
      let finishReason = '';

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
            break;
          }

          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            finishReason = choice.finish_reason || finishReason;
            const delta = choice.delta;

            if (delta?.tool_calls) {
              // Accumulate tool call fragments
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallsMap.has(idx)) {
                  toolCallsMap.set(idx, {
                    id: tc.id || '',
                    name: tc.function?.name || '',
                    arguments: '',
                  });
                }
                const entry = toolCallsMap.get(idx)!;
                if (tc.id) entry.id = tc.id;
                if (tc.function?.name) entry.name = tc.function.name;
                if (tc.function?.arguments) entry.arguments += tc.function.arguments;
              }
            }

            if (delta?.content) {
              totalOutput += delta.content;
              subscriber.next(delta.content);
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }

      // Handle tool calls if any
      if (toolCallsMap.size > 0 && recursionDepth < MAX_RECURSION) {
        const toolResults: ChatMessage[] = [];

        for (const [, tc] of toolCallsMap) {
          const result = await this.executeToolCall(tc.name, tc.arguments);
          toolResults.push({
            role: 'assistant',
            content: '',
            // We add the tool result as a separate message
          });
          toolResults.push({
            role: 'user',
            content: `工具 ${tc.name} 的返回结果：\n${JSON.stringify(result)}`,
          });
        }

        // Continue the stream with tool results injected
        const updatedMessages = [
          ...messages,
          ...toolResults,
        ];

        return this.streamDeepSeek(
          systemMsg,
          updatedMessages,
          model,
          maxTokens,
          true,
          estimatedInputTokens,
          subscriber,
          conversationId,
          queryText,
          mode,
          userId,
          recursionDepth + 1,
        );
      }

      // Final token estimation
      const estimatedOutputTokens = this.estimateTokens(totalOutput);
      this.updateStats(estimatedInputTokens, estimatedOutputTokens);

      // Persist messages
      if (conversationId) {
        try {
          await this.saveMessage(
            conversationId,
            'user',
            queryText,
            estimatedInputTokens,
            0,
          );
          await this.saveMessage(
            conversationId,
            'assistant',
            totalOutput,
            0,
            estimatedOutputTokens,
          );
        } catch (err) {
          this.logger.warn(`Failed to persist messages: ${err instanceof Error ? err.message : err}`);
        }
      }

      subscriber.complete();
    } catch (error) {
      this.logger.error('DeepSeek stream error:', error);
      subscriber.error(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ── Qwen-VL Streaming ────────────────────────────────────────────────────

  private async streamQwenVL(
    messages: ChatMessage[],
    subscriber: { next: (chunk: string) => void; complete: () => void; error: (err: Error) => void },
    options?: SendMessageOptions,
  ) {
    // Extract the last image from messages
    const lastImageMsg = [...messages].reverse().find((m) => !!m.imageUrl);
    if (!lastImageMsg?.imageUrl) {
      subscriber.next('未找到图片数据。');
      subscriber.complete();
      return;
    }

    const imageUrl = lastImageMsg.imageUrl;
    const userText = messages[messages.length - 1]?.content || '请描述这张图片';

    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { exec } = require('child_process');

    const tmpDir = os.tmpdir();
    // Detect image extension from data URL
    const extMatch = imageUrl.match(/^data:image\/(\w+);/);
    const ext = extMatch ? extMatch[1] : 'png';
    const tmpFile = path.join(tmpDir, `desocial-img-${Date.now()}.${ext}`);

    try {
      if (imageUrl.startsWith('data:')) {
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(tmpFile, Buffer.from(base64Data, 'base64'));
      } else if (imageUrl.startsWith('http')) {
        const response = await fetch(imageUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(tmpFile, buffer);
      } else {
        subscriber.next('不支持的图片格式。');
        subscriber.complete();
        return;
      }

      const cmd = `bl omni --model qwen3.5-omni-plus --image "${tmpFile}" --message "${userText.replace(/"/g, '\\"')}" --system "请始终使用中文回复。" --text-only --non-interactive --output json`;
      const result = await new Promise<string>((resolve, reject) => {
        exec(cmd, { timeout: 30000, shell: 'cmd.exe', windowsHide: true }, (err: any, stdout: string, stderr: string) => {
          try { fs.unlinkSync(tmpFile); } catch {}
          if (err) { reject(new Error(stderr || err.message)); return; }
          resolve(stdout);
        });
      });

      let content = '';
      try {
        const parsed = JSON.parse(result);
        content = parsed.content || parsed.choices?.[0]?.message?.content || '';
      } catch {
        content = result.trim();
      }

      if (!content) {
        content = '图片识别完成，但未获取到描述内容。';
      }

      for (const char of content) {
        subscriber.next(char);
        await this.delay(20);
      }

      if (options?.conversationId) {
        try {
          await this.saveMessage(options.conversationId, 'user', userText, this.estimateTokens(userText), 0, imageUrl);
          await this.saveMessage(options.conversationId, 'assistant', content, 0, this.estimateTokens(content));
        } catch {}
      }

      subscriber.complete();
    } catch (error: any) {
      try { fs.unlinkSync(tmpFile); } catch {}
      this.logger.error('VL vision error:', error.message);
      const fallback = '图片识别暂时不可用，请稍后重试。';
      for (const char of fallback) {
        subscriber.next(char);
        await this.delay(20);
      }
      subscriber.complete();
    }
  }

  // ── Image Generation (Wanx) ──────────────────────────────────────────────

  private async generateImage(prompt: string): Promise<string> {
    if (!this.dashscopeApiKey) {
      throw new Error('DASHSCOPE_API_KEY not configured');
    }

    // Call Wanx image synthesis API
    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.dashscopeApiKey}`,
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model: 'wanx-v1',
          input: {
            prompt,
            negative_prompt: '低质量，模糊，扭曲，变形',
          },
          parameters: {
            size: '1024*1024',
            n: 1,
          },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Wanx API error ${response.status}: ${errText}`);
    }

    const data = await response.json();

    // Get the OSS URL and download image to avoid signature expiry
    let ossUrl = data?.output?.results?.[0]?.url;
    if (!ossUrl) {
      const taskId = data?.output?.task_id;
      if (taskId) {
        ossUrl = await this.pollWanxTask(taskId);
      }
    }

    if (!ossUrl) {
      throw new Error(`Unexpected Wanx response: ${JSON.stringify(data)}`);
    }

    // Download image and convert to base64 data URL
    try {
      const imgResp = await fetch(ossUrl);
      const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
      const base64 = imgBuffer.toString('base64');
      const contentType = imgResp.headers.get('content-type') || 'image/png';
      return `data:${contentType};base64,${base64}`;
    } catch {
      // Fallback: return original URL if download fails
      return ossUrl;
    }
  }

  private async pollWanxTask(taskId: string): Promise<string> {
    const maxAttempts = 30;
    const pollInterval = 1000; // 1 second

    for (let i = 0; i < maxAttempts; i++) {
      await this.delay(pollInterval);

      const response = await fetch(
        `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
        {
          headers: {
            Authorization: `Bearer ${this.dashscopeApiKey}`,
          },
        },
      );

      if (!response.ok) continue;

      const data = await response.json();
      const status = data?.output?.task_status;

      if (status === 'SUCCEEDED') {
        const url = data?.output?.results?.[0]?.url;
        if (url) return url;
        throw new Error('Task succeeded but no image URL found');
      }

      if (status === 'FAILED') {
        throw new Error(`Image generation task failed: ${data?.output?.message || 'unknown error'}`);
      }

      // Still PENDING or RUNNING, continue polling
    }

    throw new Error('Image generation timed out after 30 seconds');
  }

  // ── Tool Execution ───────────────────────────────────────────────────────

  private async executeToolCall(
    name: string,
    argumentsStr: string,
  ): Promise<unknown> {
    // Security: block hallucinated write tools
    if (!ALLOWED_TOOLS.has(name)) {
      return {
        error: `Tool "${name}" is not recognized. All available tools are read-only.`,
      };
    }

    let args: Record<string, any> = {};
    try {
      args = JSON.parse(argumentsStr || '{}');
    } catch {
      args = {};
    }

    try {
      switch (name) {
        case 'search_posts':
          return this.toolSearchPosts(args);
        case 'get_trending_topics':
          return this.toolGetTrendingTopics(args);
        case 'get_user_info':
          return this.toolGetUserInfo(args);
        case 'search_users':
          return this.toolSearchUsers(args);
        case 'get_user_profile':
          return this.toolGetUserProfile(args);
        case 'get_circles':
          return this.toolGetCircles(args);
        case 'get_help_docs':
          return this.toolGetHelpDocs(args);
        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      return {
        error: `Tool execution failed: ${err instanceof Error ? err.message : err}`,
      };
    }
  }

  private async toolSearchPosts(args: { keyword?: string; type?: string; limit?: number }) {
    const keyword = args.keyword || '';
    const type = args.type || 'all';
    const limit = Math.min(args.limit || 5, 10);

    const results: any[] = [];

    if (type === 'all' || type === 'article') {
      const articles = await this.prisma.article.findMany({
        where: {
          OR: [
            { title: { contains: keyword } },
            { content: { contains: keyword } },
            { tags: { contains: keyword } },
          ],
          visibility: 'public',
        },
        select: { id: true, title: true, content: true, createdAt: true, tags: true },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });
      results.push(
        ...articles.map((a) => ({
          type: 'article',
          id: a.id,
          title: a.title,
          excerpt: a.content.substring(0, 200),
          tags: a.tags,
          createdAt: a.createdAt,
        })),
      );
    }

    if (type === 'all' || type === 'moment') {
      const moments = await this.prisma.moment.findMany({
        where: {
          content: { contains: keyword },
          visibility: 'public',
        },
        select: { id: true, content: true, createdAt: true },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });
      results.push(
        ...moments.map((m) => ({
          type: 'moment',
          id: m.id,
          content: m.content.substring(0, 200),
          createdAt: m.createdAt,
        })),
      );
    }

    return results.length > 0 ? results : { message: '未找到匹配的内容' };
  }

  private async toolGetTrendingTopics(args: { limit?: number }) {
    const limit = Math.min(args.limit || 10, 20);

    // Try Redis cache first
    const cached = await this.redis.get('trending_topics_cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return parsed.slice(0, limit);
      } catch {
        // cache parse error, fall through
      }
    }

    const topics = await this.prisma.topic.findMany({
      orderBy: { postCount: 'desc' },
      take: limit,
      select: { id: true, name: true, description: true, postCount: true },
    });

    // Cache for 5 minutes
    if (topics.length > 0) {
      await this.redis.set('trending_topics_cache', JSON.stringify(topics), 300).catch(() => {});
    }

    return topics.length > 0 ? topics : { message: '暂无热门话题' };
  }

  private async toolGetUserInfo(args: { query?: string }) {
    const query = args.query?.trim();
    if (!query) return { error: '请提供用户名或ID' };

    // Try numeric ID first
    const isNumeric = /^\d+$/.test(query);
    let user;

    if (isNumeric) {
      user = await this.prisma.user.findUnique({
        where: { id: parseInt(query, 10) },
        select: {
          id: true,
          username: true,
          nickname: true,
          bio: true,
          avatarCid: true,
          createdAt: true,
          _count: {
            select: {
              userfollows_userfollows_followerIdTouser: true,
              userfollows_userfollows_followingIdTouser: true,
            },
          },
        },
      });
    } else {
      user = await this.prisma.user.findUnique({
        where: { username: query },
        select: {
          id: true,
          username: true,
          nickname: true,
          bio: true,
          avatarCid: true,
          createdAt: true,
          _count: {
            select: {
              userfollows_userfollows_followerIdTouser: true,
              userfollows_userfollows_followingIdTouser: true,
            },
          },
        },
      });
    }

    if (!user) return { message: `未找到用户 "${query}"` };

    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      bio: user.bio,
      avatarUrl: user.avatarCid ? `https://blush-managing-swallow-349.mypinata.cloud/ipfs/${user.avatarCid}` : null,
      followers: user._count?.userfollows_userfollows_followerIdTouser || 0,
      following: user._count?.userfollows_userfollows_followingIdTouser || 0,
      createdAt: user.createdAt,
    };
  }

  private async toolSearchUsers(args: { keyword?: string; limit?: number }) {
    const keyword = args.keyword?.trim();
    if (!keyword) return { error: '请提供搜索关键词' };
    const limit = Math.min(args.limit || 10, 20);

    const users = await this.prisma.user.findMany({
      where: {
        isFrozen: false,
        OR: [
          { username: { contains: keyword } },
          { nickname: { contains: keyword } },
          { bio: { contains: keyword } },
        ],
      },
      take: limit,
      select: {
        id: true,
        username: true,
        nickname: true,
        bio: true,
        avatarCid: true,
      },
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      bio: u.bio?.slice(0, 100),
      avatarUrl: u.avatarCid ? `https://blush-managing-swallow-349.mypinata.cloud/ipfs/${u.avatarCid}` : null,
    }));
  }

  private async toolGetUserProfile(args: { userId?: number }) {
    const userId = args.userId;
    if (!userId) return { error: '请提供用户ID' };

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, nickname: true, bio: true,
        avatarCid: true, backgroundCid: true,
        createdAt: true,
        _count: {
          select: {
            article: true, moment: true,
            userfollows_userfollows_followerIdTouser: true,
            userfollows_userfollows_followingIdTouser: true,
          },
        },
      },
    });

    if (!user) return { message: `未找到用户ID ${userId}` };

    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      bio: user.bio,
      avatarUrl: user.avatarCid ? `https://blush-managing-swallow-349.mypinata.cloud/ipfs/${user.avatarCid}` : null,
      backgroundUrl: user.backgroundCid ? `https://blush-managing-swallow-349.mypinata.cloud/ipfs/${user.backgroundCid}` : null,
      posts: (user._count?.article || 0) + (user._count?.moment || 0),
      followers: user._count?.userfollows_userfollows_followerIdTouser || 0,
      following: user._count?.userfollows_userfollows_followingIdTouser || 0,
      createdAt: user.createdAt,
    };
  }

  private async toolGetCircles(args: { category?: string; limit?: number }) {
    const limit = Math.min(args.limit || 5, 10);
    const where: any = {};

    if (args.category) {
      where.category = args.category;
    }

    const circles = await this.prisma.circle.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        _count: { select: { circlemembers: true } },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return circles.length > 0
      ? circles.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          category: c.category,
          memberCount: c._count?.circlemembers || 0,
        }))
      : { message: '暂无圈子' };
  }

  private async toolGetHelpDocs(args: { topic?: string }) {
    const topic = args.topic?.toLowerCase() || '';

    const docs: Array<{ topic: string; content: string }> = [];

    const searchTerms = topic
      ? KNOWLEDGE_SEEDS.filter(
          (k) =>
            k.title.toLowerCase().includes(topic) ||
            k.content.toLowerCase().includes(topic) ||
            k.source.includes(topic),
        )
      : KNOWLEDGE_SEEDS.slice(0, 5);

    for (const doc of searchTerms) {
      docs.push({
        topic: doc.title,
        content: doc.content.substring(0, 300),
      });
    }

    if (docs.length === 0) {
      return {
        message: `未找到关于"${topic}"的帮助文档。可用的帮助主题：account（账号）、publish（发布）、privacy（隐私）、ipfs（存储）、circle（圈子）、message（私信）。`,
      };
    }

    return docs;
  }

  // ── Demo / Fallback ──────────────────────────────────────────────────────

  private getDemoResponse(userMessage: string): string {
    const msg = userMessage.trim();
    if (
      msg.includes('你好') ||
      msg.includes('hi') ||
      msg.includes('hello') ||
      msg.includes('嗨')
    ) {
      return '你好！我是DeSocial平台的AI助手，专注于解答平台使用相关问题。有什么可以帮你的？';
    }
    if (msg.includes('功能') || msg.includes('什么') || msg.includes('怎么')) {
      return 'DeSocial平台支持：内容发布（文章/动态）、圈子、私信（WebSocket加密）、IPFS去中心化存储、P2P通信、用户关注系统、话题标签、通知中心等。想了解哪个功能？';
    }
    if (msg.includes('图片') || msg.includes('图像')) {
      return '图片理解和生成功能需要配置DASHSCOPE_API_KEY环境变量后启用。目前可通过DeepSeek进行文本问答。';
    }
    return '这是演示模式回复。配置DEEPSEEK_API_KEY可启用完整AI回复。配置DASHSCOPE_API_KEY可启用图片理解和生成功能。';
  }

  // ── Utility ──────────────────────────────────────────────────────────────

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
