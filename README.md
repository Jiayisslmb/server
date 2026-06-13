# DeSocial 服务端

基于 NestJS 11 + Prisma 6 的去中心化社交平台后端。

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | NestJS | 11.0 |
| 语言 | TypeScript | 5.3 |
| ORM | Prisma | 6.19 |
| 数据库 | MySQL | 8.0 |
| 缓存 | Redis | 7.x |
| 认证 | Passport.js + JWT + bcrypt | 0.7 / 11.0 / 6.0 |
| 实时通信 | Socket.IO (WebSocket) | 4.8 |
| API 文档 | Swagger/OpenAPI | 11.2 |
| 安全 | Helmet + Throttler + class-validator | 8.2 / 6.5 |
| 日志 | Winston | 3.18 |
| 去中心化 | IPFS (Pinata) | ipfs-http-client 60 |
| AI | DeepSeek API (SSE) | v4-pro |
| 部署 | PM2 (进程守护) | - |

## 项目结构

```
server/
├── src/
│   ├── main.ts                  # 应用入口 (CORS/Helmet/Swagger/速率限制/超时)
│   ├── app.module.ts            # 根模块 (10个子模块)
│   ├── config/
│   │   ├── prisma.service.ts    # Prisma 数据库服务
│   │   ├── redis.service.ts     # Redis 缓存服务
│   │   ├── redis.module.ts      # Redis 模块
│   │   └── config-validation.service.ts  # 环境变量校验 (启动时)
│   ├── common/
│   │   ├── guards/              # JWT 认证守卫 / 管理员守卫
│   │   ├── services/            # 加密 / 隐私 / 文件验证 / 管理员安全
│   │   ├── utils/               # IPFS 服务 / 数据存储
│   │   └── ipfs.module.ts       # IPFS 模块
│   └── modules/
│       ├── auth/                # 认证模块
│       │   ├── auth.controller.ts       # 登录/登出/刷新Token/MFA
│       │   ├── auth.service.ts          # JWT签发/刷新/Redis锁/设备绑定
│       │   ├── github.strategy.ts       # GitHub OAuth Passport策略
│       │   ├── github-auth.controller.ts # GitHub回调/用户匹配/自动注册
│       │   └── auth.module.ts
│       ├── user/                # 用户模块
│       │   ├── user.controller.ts       # 注册/资料/关注/拉黑/验证码
│       │   ├── user.service.ts          # 用户CRUD/社交关系/统计
│       │   └── dto/                     # 请求体DTO
│       ├── content/             # 内容模块
│       │   ├── content.controller.ts    # 文章/动态 CRUD/点赞/评论/收藏/转发
│       │   ├── content.service.ts
│       │   └── dto/
│       ├── circle/              # 圈子模块
│       │   ├── circle.controller.ts     # 圈子CRUD/加入/离开/成员/帖子
│       │   ├── circle.service.ts
│       │   └── dto/
│       ├── message/             # 消息模块
│       │   ├── chat.gateway.ts          # WebSocket网关 (心跳/在线状态/加密)
│       │   ├── message.controller.ts    # HTTP消息接口
│       │   ├── message.service.ts
│       │   └── dto/
│       ├── notification/        # 通知模块
│       ├── chatbot/             # AI 聊天模块 (DeepSeek SSE)
│       ├── topics/              # 话题模块
│       └── admin/               # 管理模块 (用户/内容/统计/举报)
├── prisma/
│   ├── schema.prisma            # 18个数据模型 (user, article, moment, circle...)
│   ├── seed.ts                  # 数据库种子脚本
│   └── migrations/              # 数据库迁移文件
└── test/                        # E2E 测试
```

## 快速开始

### 环境要求

- Node.js 18+
- MySQL 8.0+
- Redis 7.x+

### 安装

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填写数据库连接等信息 (详见下方环境变量说明)

# 初始化数据库
npx prisma migrate dev
npx prisma db seed        # 可选：填充示例数据

# 生成 Prisma Client
npx prisma generate
```

### 启动

```bash
# 开发模式 (热重载)
npm run start:dev
# → http://localhost:3001
# → Swagger 文档: http://localhost:3001/api-docs (仅开发环境)

# 生产模式
npm run build
npm run start:prod

# PM2 进程守护
pm2 start ecosystem.config.js
```

### 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | MySQL 连接字符串 | `mysql://root:password@localhost:3306/bishe` |
| `REDIS_URL` | Redis 连接字符串 | `redis://127.0.0.1:6379` |
| `JWT_SECRET` | JWT 签名密钥 (≥32字符) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ENCRYPTION_KEY` | 消息加密密钥 (≥32字符) | 同上生成 |
| `JWT_EXPIRATION` | Token 过期时间 | `7d` |
| `NEST_PORT` | 监听端口 | `3001` (默认) / `3002` |
| `NODE_ENV` | 运行环境 | `development` / `production` |
| `CORS_ORIGINS` | 允许的跨域源 (逗号分隔) | `http://localhost:3000,https://your-domain.com` |
| `PINATA_JWT` | Pinata JWT Token | 从 pinata.cloud 获取 |
| `PINATA_GATEWAY` | IPFS 网关地址 | `https://gateway.pinata.cloud/ipfs/` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 从 platform.deepseek.com 获取 |
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID | 从 GitHub Settings → Developer Settings 获取 |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret | 同上 |
| `GITHUB_CALLBACK_URL` | GitHub OAuth 回调地址 | `http://localhost:3001/api/auth/github/callback` |
| `FRONTEND_URL` | 前端地址 (OAuth 回调重定向) | `http://localhost:3000` |

## API 接口总览

### Auth (`/api/auth`)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/login` | 用户登录 (限流 5次/分钟) |
| POST | `/auth/admin/login` | 管理员登录 (限流 3次/分钟) |
| POST | `/auth/refresh` | 刷新 Token |
| POST | `/auth/logout` | 登出 |
| GET | `/auth/github` | GitHub OAuth 入口 |
| GET | `/auth/github/callback` | GitHub OAuth 回调 |

### Users (`/api/users`)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/users/register` | 注册 |
| GET | `/users/captcha` | 获取数学验证码 |
| GET | `/users/profile` | 当前用户信息 |
| PATCH | `/users/profile` | 更新资料 |
| GET | `/users/:id` | 用户信息 |
| GET | `/users?keyword=` | 搜索 |
| POST/DELETE | `/users/:id/follow` | 关注/取消 |
| GET | `/users/:id/following` | 关注列表 |
| GET | `/users/:id/followers` | 粉丝列表 |
| POST/DELETE | `/users/:id/block` | 拉黑/取消 |

### Content (`/api/content`)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/content/articles` | 创建文章 |
| GET | `/content/articles/feed` | 文章流 |
| GET | `/content/articles/:id` | 文章详情 |
| PATCH/DELETE | `/content/articles/:id` | 编辑/删除 |
| POST | `/content/moments` | 创建动态 |
| GET | `/content/moments/feed` | 动态流 |
| POST/DELETE | `/content/moments/:id/like` | 点赞/取消 |
| POST | `/content/moments/:id/comments` | 评论 |
| POST/DELETE | `/content/moments/:id/collect` | 收藏/取消 |
| POST | `/content/moments/:id/repost` | 转发 |
| GET | `/content/search?q=` | 搜索内容 |

### Messages (`/api/messages`)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/messages/:receiverId` | 发送消息 (HTTP) |
| GET | `/messages/conversation/:userId` | 会话历史 |
| GET | `/messages/list` | 会话列表 |
| GET | `/messages/unread/count` | 未读数 |
| POST | `/messages/mark-read/:senderId` | 标记已读 |

### WebSocket 事件 (Socket.IO `/chat`)
| 事件 | 方向 | 说明 |
|------|------|------|
| `send_message` | C→S | 发送消息 |
| `new_message` | S→C | 新消息通知 |
| `message_sent` | S→C | 发送确认 |
| `typing` | 双向 | 输入状态 |
| `heartbeat` | 双向 | 心跳 (15s间隔) |
| `user_status` | S→C | 用户在线状态 |
| `join_conversation` | C→S | 加入对话房间 |
| `mark_read` | 双向 | 已读状态 |

### 其他模块
| 模块 | 路径 | 说明 |
|------|------|------|
| Circles | `/api/circles` | 圈子 CRUD/加入/离开/成员 |
| Notifications | `/api/notifications` | 通知列表/已读/删除 |
| Chatbot | `/api/chatbot` | AI 对话 (SSE) |
| Topics | `/api/topics` | 话题/热搜/趋势 |
| Admin | `/api/admin` | 管理面板 |
| IPFS | `/api/ipfs` | 文件上传/下载 |

## 安全特性

- JWT 认证 + Refresh Token 轮换
- 登录失败锁定 (5次账户锁定 / 10次IP锁定，15分钟)
- 管理员 MFA (TOTP) + 设备绑定
- DDoS 防护 (IP 级别 10秒窗口 50次限制)
- Helmet 安全头 + CORS 白名单
- class-validator DTO 白名单过滤 (防属性注入)
- 消息端到端加密 (AES-GCM + HMAC)
- 密码 bcrypt (salt rounds=10) + 强度策略验证
- 速率限制 (ThrottlerModule + 自定义注册限制)

## 数据库

### 核心模型 (18个)

- **user** — 用户 (含 GitHub OAuth/MFA/设备绑定/偏好设置)
- **article / moment** — 文章/动态 (双内容类型)
- **circle / circlemembers** — 圈子/成员
- **message** — 私信 (端到端加密)
- **notification** — 通知
- **topic / articletopic / momenttopic** — 话题关联
- **articlelike / momentlike** — 点赞
- **articlecomment / momentcomment** — 评论 (支持嵌套回复)
- **articlecollection / momentcollection** — 收藏
- **articlerepost / momentrepost** — 转发
- **userfollows** — 关注关系
- **report** — 举报
- **adminsession / adminauditlog** — 管理员审计

### 迁移

```bash
npx prisma migrate dev    # 开发环境迁移
npx prisma db push        # 直接同步 (跳过迁移文件)
npx prisma studio         # 数据库管理界面
```

## 测试

```bash
npm test              # 单元测试
npm run test:e2e      # E2E 测试
npm run test:cov      # 覆盖率
```
