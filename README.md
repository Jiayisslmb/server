# DeSocial 服务端

基于 NestJS 11 + Prisma 6 的去中心化社交平台后端。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | NestJS 11 |
| ORM | Prisma 6 + MySQL 8 |
| 缓存 | Redis 7 |
| 认证 | Passport.js + JWT + bcrypt + GitHub OAuth |
| 通信 | Socket.IO 4.8 (WebSocket / 长轮询) |
| 安全 | Helmet + Throttler + class-validator + AES-GCM 加密 |
| 日志 | Winston |
| 存储 | IPFS (Pinata) |
| AI | DeepSeek API (SSE 流式) |
| 部署 | Cloudflare Tunnel (公网) + PM2 (进程守护) |

## 快速开始

```bash
npm install
cp .env.example .env
# 编辑 .env 填写数据库/Redis/JWT密钥
npx prisma migrate dev
npm run start:dev
```

## 项目结构

```
server/
├── src/
│   ├── main.ts              # 应用入口
│   ├── app.module.ts        # 根模块
│   ├── config/              # Prisma + Redis + 环境校验
│   ├── common/              # 公共 (加密/隐私/IPFS/守卫)
│   └── modules/
│       ├── auth/            # 认证 (JWT/MFA/GitHub OAuth)
│       ├── user/            # 用户 (CRUD/关注/拉黑)
│       ├── content/         # 内容 (文章+动态 CRUD)
│       ├── message/         # 消息 (HTTP + WebSocket网关)
│       ├── circle/          # 圈子
│       ├── notification/    # 通知
│       ├── chatbot/         # AI 对话 (DeepSeek SSE)
│       ├── topics/          # 话题
│       └── admin/           # 管理面板
└── prisma/
    ├── schema.prisma        # 18个数据模型
    └── migrations/          # 数据库迁移
```

## API 模块

| 模块 | 路径 | 说明 |
|------|------|------|
| Auth | `/api/auth` | 登录/登出/Token刷新/MFA/GitHub OAuth |
| User | `/api/users` | 注册/资料/关注/粉丝/拉黑/搜索 |
| Content | `/api/content` | 文章+动态 CRUD/点赞/评论/收藏/转发 |
| Message | `/api/messages` | 私信 HTTP接口 |
| Chat | `/api/chat` (WS) | 实时消息 (Socket.IO) |
| Circle | `/api/circles` | 圈子 CRUD/加入/离开 |
| Notification | `/api/notifications` | 通知列表/已读 |
| Chatbot | `/api/chatbot` | AI SSE 流式对话 |
| Topics | `/api/topics` | 话题/热搜/趋势 |
| Admin | `/api/admin` | 用户/内容管理/统计 |

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | MySQL 连接 |
| `REDIS_URL` | Redis 连接 |
| `JWT_SECRET` | JWT 密钥 (≥32字符) |
| `ENCRYPTION_KEY` | 消息加密密钥 |
| `NEST_PORT` | 端口 (默认 3002) |
| `CORS_ORIGINS` | 允许的跨域源 |
| `GITHUB_CLIENT_ID/SECRET` | GitHub OAuth |
| `PINATA_JWT` | IPFS 上传 |
| `DEEPSEEK_API_KEY` | AI 对话 |

## 脚本

```bash
npm run start:dev    # 开发 (热重载)
npm run build        # 生产构建
npm run start:prod   # 生产启动
npm test             # 测试
npx prisma studio    # 数据库管理界面
```
